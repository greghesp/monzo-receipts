import type { ParsedReceipt } from '../types'

export function buildParsingPrompt(subject: string, body: string, from: string, emailDate?: string): string {
  const dateHint = emailDate
    ? `\nEmail received date (use as the "date" value if no explicit order date is found in the body): ${emailDate}`
    : ''
  return `You are a receipt data extractor. Extract structured receipt information from this email.

From: ${from}
Subject: ${subject}${dateHint}

Email body:
${body.slice(0, 8000)}

Return ONLY valid JSON matching this exact structure. No markdown, no code fences, no explanation — raw JSON only:
{
  "merchant": "string — merchant name",
  "total": number — total in pence (e.g. £9.99 = 999),
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
- one email line = one item, do not aggregate
- omit merchantDetails fields that are not present in the email
- if total cannot be determined, set total to 0`
}

export async function parseEmailWithClaude(
  subject: string,
  html: string,
  from: string,
  emailDate?: string
): Promise<ParsedReceipt | null> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) {
    console.log(`[openrouter] Skipping — OPENROUTER_API_KEY not set`)
    return null
  }
  const model = process.env.OPENROUTER_MODEL ?? 'anthropic/claude-haiku-4-5'
  console.log(`[openrouter] Calling ${model} for: "${subject}" (from: ${from})`)
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
        messages: [{ role: 'user', content: buildParsingPrompt(subject, html, from, emailDate) }],
      }),
    })
    if (!resp.ok) {
      const body = await resp.text()
      console.log(`[openrouter] HTTP ${resp.status} error: ${body}`)
      return null
    }
    const data = await resp.json() as { choices: Array<{ message: { content: string } }> }
    const raw = data.choices[0]?.message?.content ?? ''
    console.log(`[openrouter] Raw response: ${raw.slice(0, 300)}`)
    // Extract the JSON object regardless of any surrounding markdown fences or whitespace
    const start = raw.indexOf('{')
    const end = raw.lastIndexOf('}')
    const text = start !== -1 && end !== -1 ? raw.slice(start, end + 1) : raw
    let parsed: ParsedReceipt
    try {
      parsed = JSON.parse(text) as ParsedReceipt
    } catch (e) {
      console.log(`[openrouter] JSON parse error: ${e}`)
      return null
    }
    if (!parsed.merchant || parsed.total === undefined) {
      console.log(`[openrouter] Missing merchant or total — merchant="${parsed.merchant}" total=${parsed.total}`)
      return null
    }
    if (!parsed.date && emailDate) parsed.date = new Date(emailDate).toISOString()
    console.log(`[openrouter] Parsed OK — merchant="${parsed.merchant}" total=${parsed.total}p date=${parsed.date}`)
    return parsed
  } catch (e) {
    console.log(`[openrouter] Unexpected error: ${e}`)
    return null
  }
}
