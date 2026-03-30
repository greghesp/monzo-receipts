import { getGoogleOAuthClient } from '../google'

describe('getGoogleOAuthClient', () => {
  it('sets redirect URI correctly', () => {
    const client = getGoogleOAuthClient('cid', 'csec')
    expect(client.redirectUri).toBe('http://localhost:3000/api/auth/google/callback')
  })
})
