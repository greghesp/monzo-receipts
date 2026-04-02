import Database from 'better-sqlite3'
import { createSchema } from '../db/schema'
import {
  createUser, getUserByUsername, getUserById,
  getAllUsers, deleteUser, hasAnyUsers,
} from '../db/queries/users'

const makeDb = () => { const db = new Database(':memory:'); createSchema(db); return db }

describe('users queries', () => {
  it('hasAnyUsers returns false on empty DB', () => {
    expect(hasAnyUsers(makeDb())).toBe(false)
  })

  it('createUser inserts a row and returns an id', () => {
    const db = makeDb()
    const id = createUser(db, 'alice', 'hashed_pw')
    expect(id).toBeGreaterThan(0)
  })

  it('hasAnyUsers returns true after creating a user', () => {
    const db = makeDb()
    createUser(db, 'alice', 'hashed_pw')
    expect(hasAnyUsers(db)).toBe(true)
  })

  it('getUserByUsername returns the created user', () => {
    const db = makeDb()
    const id = createUser(db, 'alice', 'hashed_pw')
    const user = getUserByUsername(db, 'alice')
    expect(user?.username).toBe('alice')
    expect(user?.password_hash).toBe('hashed_pw')
    expect(user?.id).toBe(id)
    expect(user?.created_at).toBeGreaterThan(0)
  })

  it('getUserByUsername returns null for unknown user', () => {
    expect(getUserByUsername(makeDb(), 'nobody')).toBeNull()
  })

  it('getUserById returns correct user', () => {
    const db = makeDb()
    const id = createUser(db, 'bob', 'pw')
    expect(getUserById(db, id)?.username).toBe('bob')
  })

  it('getAllUsers returns all users', () => {
    const db = makeDb()
    createUser(db, 'alice', 'pw1')
    createUser(db, 'bob', 'pw2')
    expect(getAllUsers(db)).toHaveLength(2)
  })

  it('deleteUser removes the user', () => {
    const db = makeDb()
    const id = createUser(db, 'alice', 'pw')
    deleteUser(db, id)
    expect(getUserById(db, id)).toBeNull()
  })

  it('createUser throws on duplicate username', () => {
    const db = makeDb()
    createUser(db, 'alice', 'pw')
    expect(() => createUser(db, 'alice', 'pw2')).toThrow()
  })
})
