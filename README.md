# Monzo Receipt Matching

A locally-run Next.js app that matches Gmail receipt emails to Monzo bank transactions and submits itemised receipt data to the Monzo Receipts API — so line-item receipts appear natively inside the Monzo app.

## How it works

1. Fetches recent debit transactions from your Monzo account(s)
2. Searches Gmail for receipt/order emails covering the same period
3. Extracts receipt data from emails (JSON-LD structured data first, optional AI fallback)
4. Matches emails to transactions by amount and date
5. Submits high-confidence matches to the Monzo Receipts API automatically
6. Queues lower-confidence matches for manual review at `/review`

## Prerequisites

- Node.js 18+
- A [Monzo](https://monzo.com) account
- A Google account (Gmail)

## Setup

### 1. Clone and install

```bash
git clone <repo>
cd monzo-receipts
npm install
```

### 2. Set up Google OAuth credentials

You need a Google Cloud project with the Gmail API enabled.

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or select an existing one)
3. Enable the **Gmail API**:
   - Navigate to **APIs & Services → Library**
   - Search for "Gmail API" and click **Enable**
4. Create OAuth credentials:
   - Navigate to **APIs & Services → Credentials**
   - Click **Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Add authorised redirect URI: `http://localhost:3000/api/auth/google/callback`
   - Click **Create** and note your **Client ID** and **Client Secret**
5. Configure the OAuth consent screen:
   - Navigate to **APIs & Services → OAuth consent screen**
   - User type: **External** (or Internal if using Google Workspace)
   - Fill in app name and your email
   - Add scope: `https://www.googleapis.com/auth/gmail.readonly`
   - Add your Gmail address as a test user (required while the app is in "Testing" status)

### 3. Create your environment file

```bash
cp .env.local.example .env.local
```

Edit `.env.local` and fill in your Google credentials:

```
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-secret
```

### 4. (Optional) Enable AI email parsing

Some receipt emails don't contain structured data and require AI to extract line items. If you want this fallback:

1. Create a free account at [openrouter.ai](https://openrouter.ai)
2. Generate an API key
3. Add to `.env.local`:

```
OPENROUTER_API_KEY=sk-or-your-key
# Optional: change the model (default: anthropic/claude-haiku-4-5)
# OPENROUTER_MODEL=google/gemini-flash-1.5
```

Without this, emails that lack JSON-LD structured data will be recorded as `no_match` rather than parsed.

### 5. Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to `/setup`.

### 6. First-run setup

The `/setup` page asks for your **Monzo OAuth client credentials**:

1. Go to [Monzo Developer Portal](https://developers.monzo.com)
2. Create a new OAuth client:
   - Name: anything (e.g. "Receipt Matching")
   - Logo URL: leave blank
   - Redirect URLs: `http://localhost:3000/api/auth/monzo/callback`
   - Confidential: **Yes**
3. Note your **Client ID** (starts with `oauth2client_`) and **Client Secret**
4. Find your **Owner ID**: log in to the Monzo developer portal and check the playground — it appears as `user_...` in the `/whoami` response
5. Enter all three values in the `/setup` form and click **Save & Connect Monzo**
6. Approve the OAuth request in the Monzo app on your phone (Monzo requires phone approval for new OAuth connections)
7. Back in the browser, click **Connect Gmail** in Settings to authorise Gmail access

## Usage

### Running a match

1. Open [http://localhost:3000](http://localhost:3000)
2. Select which Monzo accounts to scan
3. Click **▶ Run Now**
4. Watch progress stream in real time
5. If any matches need review, click **Review N ›** to approve or skip them

### Scheduling

Go to **Settings → Schedule** to enable automatic runs:

| Preset | Frequency |
|--------|-----------|
| Hourly | `0 * * * *` |
| Every 6 hours | `0 */6 * * *` |
| Daily at 8pm | `0 20 * * *` |
| Custom | any cron expression |

The scheduler runs inside the Next.js server process — keep the app running (e.g. via `npm run dev` or a process manager like PM2).

### Notifications

Go to **Settings → Notifications** to configure [Apprise](https://github.com/caronc/apprise) URLs for run summaries and review alerts.

Requires `apprise` installed: `pip install apprise`

Supported services include Slack, Discord, ntfy, Pushover, Telegram, and [many more](https://github.com/caronc/apprise/wiki).

## Data storage

All data is stored locally in `~/.monzo-receipts/db.sqlite` — nothing leaves your machine except the API calls to Monzo and Google.

## Development

```bash
npm test          # run test suite
npm run dev       # development server with hot reload
```
