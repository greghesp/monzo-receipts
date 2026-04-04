// lib/db/queries/user-accounts.ts
import Database from 'better-sqlite3'

export interface UserAccountRow {
  user_id: number
  account_id: string
  account_type: string
}

export function saveUserAccounts(
  db: Database.Database,
  userId: number,
  accounts: { id: string; type: string }[]
): void {
  const upsert = db.transaction(() => {
    for (const acc of accounts) {
      db.prepare(`
        INSERT INTO user_accounts (user_id, account_id, account_type)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id, account_id) DO UPDATE SET account_type = excluded.account_type
      `).run(userId, acc.id, acc.type)
    }
  })
  upsert()
}

export function getUserAccounts(
  db: Database.Database,
  userId: number
): UserAccountRow[] {
  return db.prepare(
    'SELECT user_id, account_id, account_type FROM user_accounts WHERE user_id = ?'
  ).all(userId) as UserAccountRow[]
}
