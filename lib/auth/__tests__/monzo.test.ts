import { buildMonzoAuthUrl } from '../monzo'

describe('buildMonzoAuthUrl', () => {
  it('builds correct auth URL', () => {
    const url = new URL(buildMonzoAuthUrl('oauth2client_test'))
    expect(url.hostname).toBe('auth.monzo.com')
    expect(url.searchParams.get('client_id')).toBe('oauth2client_test')
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:3000/api/auth/monzo/callback')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('state')).toBeTruthy()
  })
})
