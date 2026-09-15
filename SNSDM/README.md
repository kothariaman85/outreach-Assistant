# Outreach Assistant

A prototype tool for drafting and sending personalized outreach emails — either one at a time from a lead-tracking queue, or in bulk to a contact list as a rate-limited campaign.

> **Status: Prototype.** This has not been tested at scale or hardened for production use. See [Limitations](#limitations) before using it with real contacts.

## What it does

- **Queue view** — track leads (name, platform, notes), generate an AI-drafted message per lead, and send it (email) or mark it as sent manually (for SNS platforms, where you paste the message in yourself).
- **Campaign view** — paste in a list of contacts (`name, email, profession`), set a send rate, and run a rate-limited bulk email campaign. Each contact gets an individually AI-drafted message. Progress is shown live (sent / failed / skipped).

## What it does *not* do

- **No automated SNS sending.** Instagram, X, LINE, Facebook, etc. are not supported for automated sending. Platforms don't provide a safe, sanctioned way to send unsolicited automated DMs, and attempting to script around that risks the account being banned. The Queue view lets you draft messages for these platforms, but you send them yourself.
- **No scraped/cold contact lists.** This is meant for people who already know you or expect to hear from you. It has no way to (and shouldn't be used to) source or send to purchased/scraped contact lists.
- **No guaranteed delivery at scale.** The AI drafting step depends on a third-party API with its own rate limits — very large batches may need to be split up or throttled further.

## Tech stack

- **Frontend:** React (single-file component)
- **Backend:** Node.js + Express
- **Email:** Nodemailer over SMTP
- **AI drafting:** Groq API (`openai/gpt-oss-20b` by default)

## Setup

### 1. Install dependencies

```bash
npm install express cors nodemailer dotenv
```

(Frontend dependencies depend on how you're running the React component — e.g. Vite, Create React App, or as a Claude/other artifact preview.)

### 2. Configure environment variables

Create a `.env` file in the backend directory:

```env
PORT=3001

# Groq (AI drafting) — get a free key at https://console.groq.com/keys
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=openai/gpt-oss-20b

# SMTP (email sending)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your_email@example.com
SMTP_PASS=your_smtp_password_or_app_password
FROM_NAME=Your Name
```

> **Note on Gmail:** if using Gmail as your SMTP host, you need an **App Password** (Google Account → Security → 2-Step Verification → App Passwords) — your regular password will not work.

**Never commit your `.env` file.** Make sure it's listed in `.gitignore` before pushing to GitHub.

### 3. Run the backend

```bash
node server.js
```

You should see:
```
Outreach assistant backend running on http://localhost:3001
```

### 4. Run the frontend

Serve the React component through your usual dev server (e.g. `npm run dev` with Vite). It expects the backend at `http://localhost:3001` — update the `API_BASE` constant in the component if you deploy the backend elsewhere.

## How to use it

### Drafting and sending to a single lead (Queue view)

1. Click **Add lead** and fill in their name, platform, handle, and (optionally) email.
2. Select the lead from the list.
3. Fill in **From**, **Tone**, and **What you offer** — these are used to personalize the draft.
4. Click **Generate draft**. Edit the text if needed.
5. If the lead has an email, click **Send email** — you'll get a confirmation prompt before anything actually sends. If not, paste the draft into the platform yourself and click **I sent this** to update your tracker.

### Running a bulk email campaign (Campaign view)

1. Switch to the **Campaign** tab.
2. Paste your contact list, one person per line, in the format:
   ```
   Name, email@example.com, Profession
   ```
3. Set your send rate (1–20 emails/minute) using the slider.
4. Click **Run campaign**. You'll be asked to confirm before anything sends.
5. Watch live progress — sent, failed, and skipped counts, plus a per-contact result list.

Each contact's message is individually AI-drafted (not a single copy-pasted template) using the same sender/offer/tone settings as the Queue view.

## API reference (backend)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/generate-draft` | POST | Generate a single AI draft from a prompt |
| `/api/send-email` | POST | Send one email to one recipient |
| `/api/send-campaign` | POST | Start a rate-limited bulk campaign; returns a `jobId` |
| `/api/campaign-status/:jobId` | GET | Poll progress for a running campaign |

## Limitations

This is an early prototype, built while still learning — some things to be aware of before relying on it:

- Job state (campaign progress) is stored in memory and will be lost if the server restarts mid-campaign.
- No authentication on the backend — anyone with access to the API can trigger sends. Not suitable for a public-facing deployment as-is.
- Error handling covers the common cases (invalid email, rate limits, missing config) but hasn't been tested against every possible failure mode.
- The 30-emails/hour and 500-contacts-per-campaign caps are conservative defaults meant to prevent accidental misuse, not tuned limits for any specific use case — adjust them deliberately, with the reasoning above in mind, rather than just raising them to remove friction.

Feedback and code review welcome — this was built as a learning project, and I'd rather have issues caught early than found in production.
