describe('buildMonzoAuthUrl', () => {
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
    const { buildMonzoAuthUrl } = require('../monzo')
    const url = new URL(buildMonzoAuthUrl('oauth2client_test'))
    expect(url.hostname).toBe('auth.monzo.com')
    expect(url.searchParams.get('client_id')).toBe('oauth2client_test')
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/api/auth/monzo/callback')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('state')).toBeTruthy()
  })

  it('uses BASE_URL env var for redirect URI when set', () => {
    process.env.BASE_URL = 'http://192.168.1.50:3000'
    jest.resetModules()
    const { buildMonzoAuthUrl } = require('../monzo')
    const url = new URL(buildMonzoAuthUrl('oauth2client_test'))
    expect(url.searchParams.get('redirect_uri')).toBe('http://192.168.1.50:3000/api/auth/monzo/callback')
  })
})
