import { google } from 'googleapis'

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
]

function getRedirectUri(): string {
  return `${process.env.BASE_URL || 'http://localhost:3000'}/api/auth/google/callback`
}

export function getGoogleOAuthClient(clientId: string, clientSecret: string) {
  return new google.auth.OAuth2(clientId, clientSecret, getRedirectUri())
}

export function buildGoogleAuthUrl(clientId: string, clientSecret: string): string {
  return getGoogleOAuthClient(clientId, clientSecret).generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'select_account consent',
  })
}

/** Fetch the authenticated user's email from Google's userinfo endpoint. */
export async function getGoogleUserEmail(accessToken: string): Promise<string> {
  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })
  const oauth2 = google.oauth2({ version: 'v2', auth })
  const { data } = await oauth2.userinfo.get()
  if (!data.email) throw new Error('Google userinfo did not return an email')
  return data.email
}
