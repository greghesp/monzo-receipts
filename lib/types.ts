// lib/types.ts
export type Provider = 'monzo' | 'google'
export type RunStatus = 'running' | 'done' | 'error'
export type MatchStatus = 'submitted' | 'skipped' | 'pending_review' | 'no_match'
export type Confidence = 'high' | 'medium'

export interface MonzoAccountOwner {
  user_id: string
  preferred_name: string
}

export interface MonzoAccount {
  id: string
  type: string        // 'uk_retail' | 'uk_retail_joint' | 'uk_business'
  description: string
  closed: boolean
  owners?: MonzoAccountOwner[]
}

export interface MonzoTransaction {
  id: string
  amount: number      // negative pence for debits
  decline_reason?: string  // present on declined transactions
  scheme?: string     // e.g. 'uk_retail_pot' for pot transfers — not real purchases
  currency: string
  created: string     // ISO 8601
  merchant: { name: string; online?: boolean } | null
  description: string
}

export interface GmailMessage {
  messageId: string
  subject: string
  from: string
  date: string        // ISO 8601
  html: string
}

export interface ParsedReceipt {
  merchant: string
  total: number       // pence
  currency: string
  date: string        // ISO 8601
  items: Array<{ description: string; amount: number; quantity: number }>
  merchantDetails?: {
    email?: string
    phone?: string
    website?: string
    address?: { address?: string; city?: string; country?: string; postcode?: string }
  }
}

export interface MatchCandidate {
  transaction: MonzoTransaction & { merchant: NonNullable<MonzoTransaction['merchant']> }
  email: GmailMessage
  receipt: ParsedReceipt
  confidence: Confidence
}
