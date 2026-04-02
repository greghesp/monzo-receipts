describe('getGoogleOAuthClient', () => {
  const originalEnv = process.env.BASE_URL

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.BASE_URL
    } else {
      process.env.BASE_URL = originalEnv
    }
    jest.resetModules()
  })

  it('uses localhost:3000 as default redirect URI when BASE_URL is not set', () => {
    delete process.env.BASE_URL
    jest.resetModules()
    const { getGoogleOAuthClient } = require('../google')
    const client = getGoogleOAuthClient('cid', 'csec')
    expect(client.redirectUri).toBe('http://localhost:3000/api/auth/google/callback')
  })

  it('uses BASE_URL env var for redirect URI when set', () => {
    process.env.BASE_URL = 'https://receipts.example.com'
    jest.resetModules()
    const { getGoogleOAuthClient } = require('../google')
    const client = getGoogleOAuthClient('cid', 'csec')
    expect(client.redirectUri).toBe('https://receipts.example.com/api/auth/google/callback')
  })
})
