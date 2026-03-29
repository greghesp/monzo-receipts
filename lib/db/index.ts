import Database from 'better-sqlite3'
import path from 'path'
import { homedir } from 'os'
import { mkdirSync } from 'fs'
import { createSchema } from './schema'

const DB_DIR = path.join(homedir(), '.monzo-receipts')
const DB_PATH = path.join(DB_DIR, 'db.sqlite')

declare global { var _db: Database.Database | undefined }

function openDb(): Database.Database {
  mkdirSync(DB_DIR, { recursive: true })
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  createSchema(db)
  return db
}

const db = global._db ?? openDb()
if (process.env.NODE_ENV !== 'production') global._db = db

export default db
