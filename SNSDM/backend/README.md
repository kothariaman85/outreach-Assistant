# Outreach assistant backend

Two options, pick one:

## Option A — Express server (runs anywhere, e.g. your own machine or a VPS)

1. `cd backend`
2. `npm install`
3. `cp .env.example .env` and paste in your real Anthropic API key
4. `npm start` → server runs on http://localhost:3001

## Option B — Vercel serverless function (no server to manage)

1. Put `generate-draft.js` inside an `api/` folder at the root of a Vercel project
2. In the Vercel dashboard: Project Settings → Environment Variables → add
   `ANTHROPIC_API_KEY`
3. Deploy (`vercel` or push to your connected git repo)
4. Your endpoint is `https://<your-project>.vercel.app/api/generate-draft`

## Update the frontend

In `OutreachAssistant.jsx`, inside `generateDraft()`, replace the direct
Anthropic call with a call to your own backend:

```js
const response = await fetch("/api/generate-draft", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ prompt }),
});
const data = await response.json();
const text = (data.text || "").trim();
if (!text) throw new Error("Empty response");
updateLead(selected.id, { draft: text, status: "drafted" });
```

If you're running the Express server locally instead of Vercel, either add a
Vite dev proxy for `/api` → `http://localhost:3001`, or just fetch the full
URL `http://localhost:3001/api/generate-draft` directly.

Note: the version of the component running inside Claude's own artifact
preview already works out of the box, calling `api.anthropic.com` directly
with no key needed — that's a sandbox-only convenience. This backend is only
needed once you take the project outside that environment (your own laptop,
a real deployment, etc.).

## Email sending

The frontend now has a "Send email" button that appears for any lead with an
email address. It calls `POST /api/send-email` on the Express server, which
sends a real email through your own SMTP account using Nodemailer.

Setup:

1. In `backend/.env`, set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
   `FROM_NAME`.
2. For Gmail specifically: turn on 2-Step Verification, then generate an
   **App Password** at https://myaccount.google.com/apppasswords — don't
   use your real Google password. Other providers (Outlook, Zoho, your own
   domain's SMTP) work the same way with their own SMTP host/port.
3. Restart the server (`npm start`).

Built-in safeguards, worth keeping even as you extend this:

- The frontend shows a native browser confirmation dialog before every send
  — no email goes out from an accidental click.
- The backend validates the address format and caps sends to 30/hour per
  process, so a bug (or someone pasting in a big list) can't turn this into
  a mass-mailer.
- This only sends to addresses you explicitly attach to a lead — there's no
  bulk-import-and-blast path, on purpose.

This email flow is a good demonstration of "real automation done safely":
one send, per person, with a human confirming each one and a hard rate
ceiling underneath. That's a deliberately different shape from the SNS DM
side, which still requires manually pasting into the platform — see the
earlier explanation of why that's a platform-ToS issue rather than a
technical one.
