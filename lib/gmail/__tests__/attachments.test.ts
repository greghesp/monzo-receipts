import { findAttachments, pickBestAttachment } from '../attachments'
import type { GmailAttachment } from '../attachments'

describe('findAttachments', () => {
  it('returns empty array for empty payload', () => {
    expect(findAttachments({})).toEqual([])
  })

  it('returns empty array for null payload', () => {
    expect(findAttachments(null)).toEqual([])
  })

  it('picks up a direct attachment on the payload', () => {
    const payload = {
      filename: 'receipt.pdf',
      mimeType: 'application/pdf',
      body: { attachmentId: 'att_1', size: 1024 },
    }
    const results = findAttachments(payload)
    expect(results).toHaveLength(1)
    expect(results[0].attachmentId).toBe('att_1')
    expect(results[0].filename).toBe('receipt.pdf')
    expect(results[0].mimeType).toBe('application/pdf')
    expect(results[0].size).toBe(1024)
  })

  it('walks nested parts and collects all attachments', () => {
    const payload = {
      parts: [
        {
          filename: 'invoice.pdf',
          mimeType: 'application/pdf',
          body: { attachmentId: 'att_pdf', size: 500 },
        },
        {
          mimeType: 'text/html',
          body: { data: 'base64htmlhere' },
          parts: [
            {
              filename: 'logo.png',
              mimeType: 'image/png',
              body: { attachmentId: 'att_img', size: 200 },
            },
          ],
        },
      ],
    }
    const results = findAttachments(payload)
    expect(results).toHaveLength(2)
    expect(results.map(a => a.attachmentId)).toEqual(['att_pdf', 'att_img'])
  })

  it('skips parts with no filename or no attachmentId', () => {
    const payload = {
      parts: [
        { filename: '', mimeType: 'text/html', body: { data: 'base64' } },
        { filename: 'noId.pdf', mimeType: 'application/pdf', body: {} },
        { filename: 'real.pdf', mimeType: 'application/pdf', body: { attachmentId: 'att_real', size: 0 } },
      ],
    }
    const results = findAttachments(payload)
    expect(results).toHaveLength(1)
    expect(results[0].attachmentId).toBe('att_real')
  })

  it('defaults mimeType to application/octet-stream when missing', () => {
    const payload = {
      filename: 'mystery.bin',
      body: { attachmentId: 'att_bin', size: 10 },
    }
    const results = findAttachments(payload)
    expect(results[0].mimeType).toBe('application/octet-stream')
  })
})

describe('pickBestAttachment', () => {
  it('returns null for empty array', () => {
    expect(pickBestAttachment([])).toBeNull()
  })

  it('prefers PDF over images', () => {
    const attachments: GmailAttachment[] = [
      { attachmentId: 'img', filename: 'receipt.png', mimeType: 'image/png', size: 100 },
      { attachmentId: 'pdf', filename: 'receipt.pdf', mimeType: 'application/pdf', size: 200 },
    ]
    expect(pickBestAttachment(attachments)?.attachmentId).toBe('pdf')
  })

  it('returns first image when no PDF present', () => {
    const attachments: GmailAttachment[] = [
      { attachmentId: 'jpg', filename: 'scan.jpg', mimeType: 'image/jpeg', size: 50 },
      { attachmentId: 'webp', filename: 'scan.webp', mimeType: 'image/webp', size: 80 },
    ]
    expect(pickBestAttachment(attachments)?.attachmentId).toBe('jpg')
  })

  it('returns first attachment when none are receipt MIME types', () => {
    const attachments: GmailAttachment[] = [
      { attachmentId: 'zip', filename: 'archive.zip', mimeType: 'application/zip', size: 999 },
    ]
    expect(pickBestAttachment(attachments)?.attachmentId).toBe('zip')
  })

  it('handles single PDF attachment', () => {
    const attachments: GmailAttachment[] = [
      { attachmentId: 'only_pdf', filename: 'only.pdf', mimeType: 'application/pdf', size: 300 },
    ]
    expect(pickBestAttachment(attachments)?.attachmentId).toBe('only_pdf')
  })
})
