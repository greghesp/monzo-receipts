import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import db from '@/lib/db'
import { getAllGoogleAccessTokens } from '@/lib/token-refresh'
import { requireSession } from '@/lib/auth/session'
import { extractHtmlBodyFromPayload } from '@/lib/gmail/extract'
import { findAttachments, pickBestAttachment, downloadGmailAttachment } from '@/lib/gmail/attachments'
import { extractJsonLdOrder } from '@/lib/parsing/jsonld'
import { parseEmailWithClaude } from '@/lib/parsing/claude'
import { parseReceiptFromPdf } from '@/lib/parsing/pdf'
import type { GmailMessage } from '@/lib/types'

interface UrlParts {
  urlId: string | null       // compact base64url ID from fragment (may not decode cleanly)
  threadHexId: string | null // definitive hex thread ID when available (e.g. from popout URL)
  searchQuery: string | null // extracted from #search/QUERY/ID URLs
}

function extractUrlParts(url: string): UrlParts | null {
  // Gmail URL formats:
  //   #inbox/COMPACT_ID
  //   #all/COMPACT_ID
  //   #search/QUERY/COMPACT_ID   ← search results
  //   #label/LABEL/COMPACT_ID
  //   /popout?th=%23thread-f%3ADECIMAL_ID  ← popout/print view (most reliable)

  let urlId: string | null = null
  let threadHexId: string | null = null
  let searchQuery: string | null = null

  // Popout URL: extract decimal thread ID from `th` param → convert to hex
  // e.g. th=%23thread-f%3A1858986879220468439
  try {
    const parsed = new URL(url)
    const th = parsed.searchParams.get('th')
    if (th) {
      const match = th.replace(/%23/gi, '#').replace(/%3A/gi, ':').match(/thread-f[:/](\d+)/)
      if (match) {
        threadHexId = BigInt(match[1]).toString(16)
      }
    }
  } catch { /* not a valid URL */ }

  // Fragment-based URL (#inbox/ID, #search/query/ID, etc.)
  const fragment = url.split('#')[1]
  if (fragment) {
    const parts = fragment.split('/').filter(Boolean)
    if (parts.length > 0) {
      urlId = parts[parts.length - 1]
      if (parts[0] === 'search' && parts.length >= 3) {
        searchQuery = decodeURIComponent(parts[1])
      }
    }
  }

  if (!urlId && !threadHexId) return null
  return { urlId, threadHexId, searchQuery }
}

function decodeBase64UrlToHex(id: string): string {
  // Gmail URL IDs are sometimes base64url-encoded thread/message IDs
  const base64 = id.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  return Buffer.from(padded, 'base64').toString('hex')
}

function buildGmailMessage(msgData: any, messageId: string): GmailMessage {
  const headers = msgData.payload?.headers ?? []
  const get = (name: string) => headers.find((h: any) => h.name?.toLowerCase() === name)?.value ?? ''
  return {
    messageId,
    subject: get('subject'),
    from: get('from'),
    date: get('date'),
    html: extractHtmlBodyFromPayload(msgData.payload),
    attachments: findAttachments(msgData.payload),
  }
}

async function getThreadLastMessage(gmail: any, threadId: string): Promise<{ msgData: any; messageId: string }> {
  const resp = await gmail.users.threads.get({ userId: 'me', id: threadId, format: 'full' })
  const messages = resp.data.messages ?? []
  if (!messages.length) throw new Error('Thread has no messages')
  const msg = messages[messages.length - 1]
  return { msgData: msg, messageId: msg.id }
}

async function resolveMessage(gmail: any, { urlId, threadHexId, searchQuery }: UrlParts): Promise<{ msgData: any; messageId: string }> {
  const attempts: Array<{ label: string; fn: () => Promise<{ msgData: any; messageId: string }> }> = []

  // Strategy 1: definitive hex thread ID from popout URL (most reliable)
  if (threadHexId) {
    attempts.push({
      label: `threads.get(${threadHexId}) [popout th param]`,
      fn: () => getThreadLastMessage(gmail, threadHexId!),
    })
  }

  if (urlId) {
    const hexId = decodeBase64UrlToHex(urlId)

    // Strategy 2: raw compact URL ID (works for some older-style hex Gmail URLs)
    attempts.push(
      {
        label: `messages.get(${urlId})`,
        fn: async () => {
          const resp = await gmail.users.messages.get({ userId: 'me', id: urlId, format: 'full' })
          return { msgData: resp.data, messageId: urlId! }
        },
      },
      {
        label: `threads.get(${urlId})`,
        fn: () => getThreadLastMessage(gmail, urlId!),
      },
    )

    // Strategy 3: Gmail compact URL IDs decode to 24 bytes; the real 8-byte API thread ID
    // is embedded within them — try each 16-hex-char (8-byte) chunk
    if (hexId.length === 48) {
      for (let i = 0; i <= 32; i += 8) {
        const chunk = hexId.slice(i, i + 16)
        attempts.push({
          label: `threads.get(${chunk}) [decoded chunk @${i}]`,
          fn: () => getThreadLastMessage(gmail, chunk),
        })
      }
    } else {
      attempts.push({
        label: `threads.get(${hexId}) [decoded]`,
        fn: () => getThreadLastMessage(gmail, hexId),
      })
    }
  }

  // Strategy 4: search fallback for #search/QUERY/ID URLs
  if (searchQuery) {
    attempts.push({
      label: `messages.list(q="${searchQuery}") [search fallback]`,
      fn: async () => {
        const listResp = await gmail.users.messages.list({ userId: 'me', q: searchQuery, maxResults: 1 })
        const messages = listResp.data.messages ?? []
        if (!messages.length) throw new Error(`No messages found for query "${searchQuery}"`)
        const msgId = messages[0].id
        const resp = await gmail.users.messages.get({ userId: 'me', id: msgId, format: 'full' })
        return { msgData: resp.data, messageId: msgId }
      },
    })
  }

  const errors: string[] = []
  for (const attempt of attempts) {
    try {
      const result = await attempt.fn()
      console.log(`[manual-match] resolved via: ${attempt.label}`)
      return result
    } catch (e: any) {
      const msg = e?.message ?? String(e)
      console.log(`[manual-match] ${attempt.label} failed: ${msg}`)
      errors.push(`${attempt.label}: ${msg}`)
    }
  }

  throw new Error(
    'Could not find this email via the Gmail API.\n' +
    'Attempts:\n' + errors.map(e => `  • ${e}`).join('\n') + '\n\n' +
    'Make sure you are logged into the same Google account and the URL is copied from an open email in Gmail.'
  )
}

export async function POST(req: NextRequest) {
  const session = requireSession(db, req.headers.get('x-session-token') ?? undefined)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { userId } = session

  const { url } = await req.json() as { url: string }
  if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 })

  const parts = extractUrlParts(url)
  if (!parts) return NextResponse.json({ error: 'Could not extract a message ID from this URL. Paste the URL directly from the Gmail address bar, or use a popout/print view URL.' }, { status: 400 })

  try {
    const googleAccounts = await getAllGoogleAccessTokens(db, userId)
    if (googleAccounts.length === 0) throw new Error('Gmail not connected')

    // Try each connected Gmail account until the message is found
    // (a message ID is account-specific, so only one account will succeed)
    let lastError: unknown
    for (const { accessToken } of googleAccounts) {
      try {
        const auth = new google.auth.OAuth2()
        auth.setCredentials({ access_token: accessToken })
        const gmail = google.gmail({ version: 'v1', auth })

        const { msgData, messageId } = await resolveMessage(gmail, parts)
        const email = buildGmailMessage(msgData, messageId)

        let receipt =
          extractJsonLdOrder(email.html, email.date) ??
          await parseEmailWithClaude(email.subject, email.html, email.from, email.date)

        // If HTML parsing failed or returned zero total (email body had no financial data),
        // try any attached PDF invoice — Claude may have set total=0 per the prompt rules.
        const htmlReceiptUseless = !receipt || receipt.total === 0
        if (htmlReceiptUseless) {
          const pdfs = email.attachments.filter(a => a.mimeType === 'application/pdf')
          const bestPdf = pickBestAttachment(pdfs)
          if (bestPdf) {
            console.log(`[manual-match] Trying PDF attachment: "${bestPdf.filename}"`)
            const pdfBuffer = await downloadGmailAttachment(gmail, messageId, bestPdf.attachmentId)
            const pdfReceipt = await parseReceiptFromPdf(pdfBuffer, bestPdf.filename)
            // Only upgrade to PDF result if it has a real total
            if (pdfReceipt && pdfReceipt.total > 0) receipt = pdfReceipt
          }
        }

        return NextResponse.json({ email, receipt, messageId })
      } catch (e) {
        lastError = e
        // Continue to next account
      }
    }
    throw lastError
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
