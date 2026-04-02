export interface GmailAttachment {
  attachmentId: string
  filename: string
  mimeType: string
  size: number
}

/** Receipt-like MIME types we'll prefer over other attachments */
const RECEIPT_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
])

/** Walk a Gmail message payload and collect all non-inline attachments */
export function findAttachments(payload: any): GmailAttachment[] {
  const results: GmailAttachment[] = []

  function walk(part: any) {
    if (!part) return
    const filename: string = part.filename ?? ''
    const attachmentId: string = part.body?.attachmentId ?? ''
    if (filename && attachmentId) {
      results.push({
        attachmentId,
        filename,
        mimeType: part.mimeType ?? 'application/octet-stream',
        size: part.body?.size ?? 0,
      })
    }
    for (const child of part.parts ?? []) walk(child)
  }

  walk(payload)
  return results
}

/** Return the best attachment for a receipt — prefer PDFs, then images */
export function pickBestAttachment(attachments: GmailAttachment[]): GmailAttachment | null {
  if (attachments.length === 0) return null
  const preferred = attachments.filter(a => RECEIPT_MIME_TYPES.has(a.mimeType))
  if (preferred.length === 0) return attachments[0]
  // Prefer PDF over images
  const pdf = preferred.find(a => a.mimeType === 'application/pdf')
  return pdf ?? preferred[0]
}

/** Download attachment bytes from Gmail API */
export async function downloadGmailAttachment(
  gmail: any,
  messageId: string,
  attachmentId: string
): Promise<Buffer> {
  const resp = await gmail.users.messages.attachments.get({
    userId: 'me',
    messageId,
    id: attachmentId,
  })
  // Gmail returns base64url-encoded data
  const b64 = (resp.data.data as string).replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(b64, 'base64')
}
