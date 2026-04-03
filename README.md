# Monzo Receipt Matching

Self-hosted Next.js app that connects your Gmail and Monzo accounts to automatically match receipt emails to bank transactions. Extracts line-item data from emails and submits it to the Monzo Receipts API, so itemised receipts appear natively inside the Monzo app. High-confidence matches are submitted automatically; lower-confidence matches are queued for manual review.

## How it works

1. Fetches recent debit transactions from your Monzo account(s)
2. Searches Gmail for receipt/order emails covering the same period
3. Extracts receipt data from emails (JSON-LD structured data first, optional AI fallback)
4. Matches emails to transactions by amount and date
5. Submits high-confidence matches to the Monzo Receipts API automatically
6. Queues lower-confidence matches for manual review at `/review`

---

## Prerequisites

Before you start, you'll need to set up credentials for two services. These steps apply whether you're running via Docker or manually.

### 1. Google OAuth (Gmail access)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or select an existing one)
3. Enable the **Gmail API**: APIs & Services → Library → search "Gmail API" → Enable
4. Create OAuth credentials:
   - APIs & Services → Credentials → Create Credentials → OAuth client ID
   - Application type: **Web application**
   - Add authorised redirect URI: `http://<your-host>/api/auth/google/callback`
   - Note your **Client ID** and **Client Secret**
5. Configure the OAuth consent screen:
   - APIs & Services → OAuth consent screen
   - User type: **External** (or Internal if using Google Workspace)
   - Add scope: `https://www.googleapis.com/auth/gmail.readonly`
   - Add your Gmail address as a test user

### 2. Monzo OAuth

1. Go to [Monzo Developer Portal](https://developers.monzo.com)
2. Create a new OAuth client:
   - Name: anything (e.g. "Receipt Matching")
   - Redirect URLs: `http://<your-host>/api/auth/monzo/callback`
   - Confidential: **Yes**
3. Note your **Client ID** (starts with `oauth2client_`) and **Client Secret**
4. Find your **Owner ID**: in the developer portal playground, call `/whoami` — it appears as `user_...`

> **Note:** `<your-host>` is `localhost:3000` for local setups, or your server's IP/domain for Docker deployments (e.g. `192.168.1.50:3000`). The redirect URIs registered above must exactly match the `BASE_URL` you configure.

### 3. (Optional) AI email parsing

Some receipt emails don't contain structured data and require AI to extract line items. Without this, emails lacking JSON-LD structured data will be skipped.

1. Create a free account at [openrouter.ai](https://openrouter.ai)
2. Generate an API key

---

## Running with Docker

The recommended way to run the app. Docker bundles everything — Node.js, Chromium, and apprise — into a single image that runs on any machine.

The image is available on Docker Hub: `greghesp/monzo-receipts`

### Docker Compose (recommended)

**1. Create your environment file**

```bash
cp .env.example .env
```

Edit `.env` and fill in your credentials:

```env
BASE_URL=http://192.168.1.50:3000    # URL where the app will be accessed
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-secret
OPENROUTER_API_KEY=sk-or-your-key    # optional
```

**2. Start the app**

```bash
docker compose up -d
```

Open `BASE_URL` in your browser to complete setup.

### docker run (for Unraid / NAS UIs)

```bash
docker run -d \
  -p 3000:3000 \
  -v $(pwd)/data:/data \
  -e BASE_URL=http://localhost:3000 \
  -e GOOGLE_CLIENT_ID=your-client-id \
  -e GOOGLE_CLIENT_SECRET=your-secret \
  -e OPENROUTER_API_KEY=sk-or-... \
  --restart unless-stopped \
  greghesp/monzo-receipts:latest
```

### Data persistence

All data is stored in `./data/db.sqlite` next to the compose file. Back it up by copying that file.

---

## First-run setup

Once the app is running, open it in your browser — you'll be redirected to `/setup`.

1. Enter your Monzo **Client ID**, **Client Secret**, and **Owner ID**, then click **Save & Connect Monzo**
2. Approve the OAuth request in the **Monzo app on your phone** (required for all new OAuth connections)
3. Back in the browser, go to **Settings → Connect Gmail** to authorise Gmail access

---

## Usage

### Running a match

1. Open the app in your browser
2. Select which Monzo accounts to scan
3. Click **▶ Run Now**
4. Watch progress stream in real time
5. If any matches need review, click **Review N ›** to approve or skip them

### Scheduling

Go to **Settings → Schedule** to enable automatic runs:

| Preset | Cron |
|--------|------|
| Hourly | `0 * * * *` |
| Every 6 hours | `0 */6 * * *` |
| Daily at 8pm | `0 20 * * *` |
| Custom | any cron expression |

### Notifications

Go to **Settings → Notifications** to configure [Apprise](https://github.com/caronc/apprise) notification URLs. Supported services include Slack, Discord, ntfy, Pushover, Telegram, and [many more](https://github.com/caronc/apprise/wiki).

---

## Manual setup (without Docker)

### Prerequisites

- Node.js 18+
- `apprise` installed (`pip install apprise`) if you want notifications

### Install and run

```bash
git clone https://github.com/greghesp/monzo-receipts.git
cd monzo-receipts
npm install
cp .env.local.example .env.local
```

Edit `.env.local`:

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-secret
OPENROUTER_API_KEY=sk-or-your-key    # optional
```

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and follow the [first-run setup](#first-run-setup) steps above.

Data is stored locally at `~/.monzo-receipts/db.sqlite`.

---

## Contributing

Contributions are welcome. Please follow the branching strategy below.

### Branching strategy

| Branch | Purpose |
|--------|---------|
| `develop` | Active development — open PRs against this branch |
| `master` | Stable releases only — never commit directly |

### Making a contribution

1. Fork the repo and create your branch from `develop`
2. Make your changes and ensure the build passes (`npm run build`)
3. Open a pull request targeting `develop`

### Releasing (maintainers only)

When `develop` is ready to release, merge into `master` and tag:

```bash
git checkout master
git merge develop
git push origin master
git tag v1.0.0
git push origin v1.0.0
```

Pushing a version tag triggers an automated Docker Hub build, publishing `greghesp/monzo-receipts:latest` and `greghesp/monzo-receipts:v1.0.0`.
