import Database from 'better-sqlite3'
import path from 'path'
import { mkdirSync } from 'fs'
import { createSchema } from './schema'
import { resolveDbPath } from './path'

const dbPath = resolveDbPath()
const DB_DIR = path.dirname(dbPath)

declare global { var _db: Database.Database | undefined }

function openDb(): Database.Database {
  mkdirSync(DB_DIR, { recursive: true })
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  createSchema(db)
  return db
}

const db = global._db ?? openDb()
if (process.env.NODE_ENV !== 'production') global._db = db

export default db
