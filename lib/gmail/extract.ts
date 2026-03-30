export function extractHtmlBodyFromPayload(payload: any): string {
  if (!payload) return ''
  if (payload.mimeType === 'text/html' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8')
  }
  for (const part of payload.parts ?? []) {
    const result = extractHtmlBodyFromPayload(part)
    if (result) return result
  }
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8')
  }
  return ''
}
