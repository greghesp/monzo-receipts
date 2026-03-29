// lib/types.ts
export type Provider = 'monzo' | 'google'
export type RunStatus = 'running' | 'done' | 'error'
export type MatchStatus = 'submitted' | 'skipped' | 'pending_review' | 'no_match'
export type Confidence = 'high' | 'medium'

export interface MonzoAccount {
  id: string
  type: string        // 'uk_retail' | 'uk_retail_joint' | 'uk_business'
  description: string
  closed: boolean
}

export interface MonzoTransaction {
  id: string
  amount: number      // negative pence for debits
  currency: string
  created: string     // ISO 8601
  merchant: { name: string } | null
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
  transaction: MonzoTransaction
  email: GmailMessage
  receipt: ParsedReceipt
  confidence: Confidence
}
