/**
 * Monzo Attachments API
 * Flow: uploadAttachment → (S3 PUT handled internally) → registerAttachment
 */

interface UploadResult {
  fileUrl: string
  uploadUrl: string
}

/** Step 1 — request an upload slot from Monzo, returns a pre-signed S3 URL */
async function requestUploadUrl(
  accessToken: string,
  fileName: string,
  fileType: string,
  contentLength: number
): Promise<UploadResult> {
  const body = new URLSearchParams({ file_name: fileName, file_type: fileType, content_length: String(contentLength) })
  const resp = await fetch('https://api.monzo.com/attachment/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!resp.ok) {
    const err = await resp.text().catch(() => '')
    throw new Error(`Monzo attachment/upload failed (${resp.status}): ${err}`)
  }
  const data = await resp.json() as { file_url: string; upload_url: string }
  return { fileUrl: data.file_url, uploadUrl: data.upload_url }
}

/** Step 2 — PUT file bytes directly to the S3 pre-signed URL */
async function putToS3(uploadUrl: string, fileType: string, data: Buffer): Promise<void> {
  const resp = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': fileType, 'Content-Length': String(data.length) },
    // Cast to Uint8Array — fetch's BodyInit accepts it; Buffer alone trips TS
    body: new Uint8Array(data),
  })
  if (!resp.ok) {
    throw new Error(`S3 upload failed (${resp.status})`)
  }
}

/** Step 3 — register the uploaded file against a Monzo transaction */
export async function registerAttachment(
  accessToken: string,
  transactionId: string,
  fileUrl: string,
  fileType: string
): Promise<void> {
  const body = new URLSearchParams({ external_id: transactionId, file_url: fileUrl, file_type: fileType })
  const resp = await fetch('https://api.monzo.com/attachment/register', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!resp.ok) {
    const err = await resp.text().catch(() => '')
    throw new Error(`Monzo attachment/register failed (${resp.status}): ${err}`)
  }
}

/** Upload a file to Monzo-hosted storage and register it against a transaction */
export async function uploadAndAttach(
  accessToken: string,
  transactionId: string,
  fileName: string,
  fileType: string,
  data: Buffer
): Promise<void> {
  const { fileUrl, uploadUrl } = await requestUploadUrl(accessToken, fileName, fileType, data.length)
  await putToS3(uploadUrl, fileType, data)
  await registerAttachment(accessToken, transactionId, fileUrl, fileType)
}
