import { google } from 'googleapis'
import type { GmailMessage } from '../types'

export function buildGmailQuery(sinceIso: string): string {
  const d = new Date(sinceIso)
  const dateStr = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`
  return `subject:(order OR receipt OR confirmation OR invoice) after:${dateStr}`
}

export async function searchReceipts(
  accessToken: string,
  sinceIso: string,
  maxResults = 200
): Promise<string[]> {
  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })
  const gmail = google.gmail({ version: 'v1', auth })

  const resp = await gmail.users.messages.list({
    userId: 'me',
    q: buildGmailQuery(sinceIso),
    maxResults,
  })

  return (resp.data.messages ?? []).map(m => m.id!)
}

export async function readEmail(accessToken: string, messageId: string): Promise<GmailMessage> {
  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })
  const gmail = google.gmail({ version: 'v1', auth })

  const msg = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' })
  const headers = msg.data.payload?.headers ?? []
  const get = (name: string) => headers.find(h => h.name?.toLowerCase() === name)?.value ?? ''

  const html = extractHtmlBody(msg.data.payload)

  return {
    messageId,
    subject: get('subject'),
    from: get('from'),
    date: get('date'),
    html,
  }
}

function extractHtmlBody(payload: any): string {
  if (!payload) return ''
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8')
  }
  for (const part of payload.parts ?? []) {
    const result = extractHtmlBody(part)
    if (result) return result
  }
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8')
  }
  return ''
}
