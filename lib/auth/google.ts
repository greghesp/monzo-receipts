import { google } from 'googleapis'

const REDIRECT_URI = 'http://localhost:3000/api/auth/google/callback'
const SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']

export function getGoogleOAuthClient(clientId: string, clientSecret: string) {
  return new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI)
}

export function buildGoogleAuthUrl(clientId: string, clientSecret: string): string {
  return getGoogleOAuthClient(clientId, clientSecret).generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  })
}
