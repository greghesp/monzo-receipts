import path from 'path'
import { homedir } from 'os'

export function resolveDbPath(): string {
  return process.env.DB_PATH ?? path.join(homedir(), '.monzo-receipts', 'db.sqlite')
}
