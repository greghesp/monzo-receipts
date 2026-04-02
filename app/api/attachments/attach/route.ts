import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'
import db from '@/lib/db'
import { getMonzoAccessToken, getGoogleAccessToken } from '@/lib/token-refresh'
import { requireSession } from '@/lib/auth/session'
import { extractHtmlBodyFromPayload } from '@/lib/gmail/extract'
import { findAttachments, pickBestAttachment, downloadGmailAttachment } from '@/lib/gmail/attachments'
import { uploadAndAttach } from '@/lib/monzo/attachments'
import { generateEmailPdf } from '@/lib/pdf/generate'

/** Produce a filename safe for Monzo's API: alphanumeric, hyphens, underscores only */
function sanitiseFileName(name: string, forceExt?: string): string {
  // Split off existing extension
  const lastDot = name.lastIndexOf('.')
  const base = lastDot > 0 ? name.slice(0, lastDot) : name
  const ext  = forceExt ?? (lastDot > 0 ? name.slice(lastDot + 1) : '')

  const safeBase = base
    .replace(/\s+/g, '_')          // spaces → underscores
    .replace(/[^a-z0-9_-]/gi, '')  // remove anything else
    .replace(/_+/g, '_')           // collapse consecutive underscores
    .slice(0, 60)
    || 'receipt'

  return ext ? `${safeBase}.${ext}` : safeBase
}

export async function POST(req: NextRequest) {
  const session = requireSession(db, req.headers.get('x-session-token') ?? undefined)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { userId } = session

  const { transactionId, messageId } = await req.json() as {
    transactionId: string
    messageId: string
  }

  if (!transactionId || !messageId) {
    return NextResponse.json({ error: 'transactionId and messageId are required' }, { status: 400 })
  }

  try {
    const [monzoToken, googleToken] = await Promise.all([
      getMonzoAccessToken(db, userId),
      getGoogleAccessToken(db, userId),
    ])

    // Set up Gmail client
    const auth = new google.auth.OAuth2()
    auth.setCredentials({ access_token: googleToken })
    const gmail = google.gmail({ version: 'v1', auth })

    // Fetch the full message
    const msgResp = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' })
    const msgData = msgResp.data

    const headers = msgData.payload?.headers ?? []
    const get = (name: string) => headers.find((h: any) => h.name?.toLowerCase() === name)?.value ?? ''
    const subject = get('subject') || 'Receipt'
    const from = get('from') || ''
    const date = get('date') || new Date().toISOString()

    // Look for receipt/invoice attachments
    const attachments = findAttachments(msgData.payload)
    const best = pickBestAttachment(attachments)

    let fileData: Buffer
    let fileName: string
    let fileType: string
    let source: 'attachment' | 'pdf'

    if (best) {
      console.log(`[attach] Found attachment: ${best.filename} (${best.mimeType}, ${best.size} bytes)`)
      fileData = await downloadGmailAttachment(gmail, messageId, best.attachmentId)
      fileName = sanitiseFileName(best.filename)
      fileType = best.mimeType
      source = 'attachment'
    } else {
      console.log(`[attach] No attachment found — generating PDF from email body`)
      const html = extractHtmlBodyFromPayload(msgData.payload)
      fileData = await generateEmailPdf(subject, from, date, html)
      fileName = sanitiseFileName(subject, 'pdf')
      fileType = 'application/pdf'
      source = 'pdf'
    }

    console.log(`[attach] Uploading ${fileName} (${fileType}, ${fileData.length} bytes) for tx ${transactionId}`)
    await uploadAndAttach(monzoToken, transactionId, fileName, fileType, fileData)
    console.log(`[attach] Successfully attached ${source} to ${transactionId}`)

    return NextResponse.json({ success: true, source, fileName })
  } catch (e: any) {
    console.error(`[attach] Error:`, e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
