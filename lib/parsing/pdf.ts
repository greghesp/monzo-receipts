import type { ParsedReceipt } from '../types'

/**
 * Parse a receipt or invoice PDF using the same OpenRouter/Claude model as
 * the HTML email parser. The PDF is sent as a base64-encoded document block
 * so Claude sees the actual layout, tables, and formatting rather than
 * stripped text.
 */
export async function parseReceiptFromPdf(
  pdfBuffer: Buffer,
  filename = 'invoice.pdf'
): Promise<ParsedReceipt | null> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    console.log(`[openrouter] Skipping PDF parse — OPENROUTER_API_KEY not set`)
    return null
  }
  const model = process.env.OPENROUTER_MODEL ?? 'anthropic/claude-haiku-4-5'
  const base64 = pdfBuffer.toString('base64')

  console.log(`[openrouter] Parsing PDF attachment: "${filename}" (${pdfBuffer.length} bytes) with ${model}`)

  try {
    const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: base64,
              },
            },
            {
              type: 'text',
              text: `This is a receipt or invoice PDF. Extract the following information and return ONLY valid JSON with no markdown, no code fences, no explanation — raw JSON only:
{
  "merchant": "string — merchant/supplier name",
  "total": number — total amount due in pence (e.g. £9.99 = 999),
  "currency": "GBP",
  "date": "ISO 8601 date string",
  "items": [
    { "description": "string", "amount": number (pence), "quantity": number }
  ],
  "merchantDetails": {
    "email": "string or omit",
    "phone": "string or omit",
    "website": "string or omit",
    "address": { "address": "string or omit", "city": "string or omit", "country": "GB", "postcode": "string or omit" }
  }
}

Rules:
- amounts are integers in pence (£1.00 = 100)
- use the invoice total (amount due), not subtotals or line items
- one invoice line = one item, do not aggregate
- omit merchantDetails fields not present in the document
- if total cannot be determined, set total to 0`,
            },
          ],
        }],
      }),
    })

    if (!resp.ok) {
      const body = await resp.text()
      console.log(`[openrouter] PDF HTTP ${resp.status} error: ${body}`)
      return null
    }

    const data = await resp.json() as { choices: Array<{ message: { content: string } }> }
    const raw = data.choices[0]?.message?.content ?? ''
    console.log(`[openrouter] PDF parse raw response: ${raw.slice(0, 300)}`)

    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    const text = start !== -1 && end !== -1 ? raw.slice(start, end + 1) : raw

    let parsed: ParsedReceipt
    try {
      parsed = JSON.parse(text) as ParsedReceipt
    } catch (e) {
      console.log(`[openrouter] PDF JSON parse error: ${e}`)
      return null
    }

    if (!parsed.merchant || parsed.total === undefined) {
      console.log(`[openrouter] PDF parse missing merchant or total — merchant="${parsed.merchant}" total=${parsed.total}`)
      return null
    }

    console.log(`[openrouter] PDF parsed OK — merchant="${parsed.merchant}" total=${parsed.total}p date=${parsed.date}`)
    return parsed
  } catch (e) {
    console.log(`[openrouter] PDF parse unexpected error: ${e}`)
    return null
  }
}
