import Anthropic from '@anthropic-ai/sdk'
import type { ParsedReceipt } from '../types'

const client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null

export function buildParsingPrompt(subject: string, body: string, from: string): string {
  return `You are a receipt data extractor. Extract structured receipt information from this email.

From: ${from}
Subject: ${subject}

Email body:
${body.slice(0, 8000)}

Return ONLY valid JSON matching this exact structure (no markdown, no explanation):
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
  from: string
): Promise<ParsedReceipt | null> {
  if (!client) return null
  try {
    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: buildParsingPrompt(subject, html, from) }],
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const parsed = JSON.parse(text) as ParsedReceipt
    if (!parsed.merchant || parsed.total === undefined) return null
    return parsed
  } catch {
    return null
  }
}
