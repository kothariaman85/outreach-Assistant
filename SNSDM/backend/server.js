import express from "express";
import cors from "cors";
import nodemailer from "nodemailer";
import "dotenv/config";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// ---- Groq config ----
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-20b";

if (!GROQ_API_KEY) {
  console.warn(
    "Warning: GROQ_API_KEY is not set. Requests to /api/generate-draft will fail."
  );
}

// ---- Email (SMTP) config ----
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const FROM_NAME = process.env.FROM_NAME || SMTP_USER;

let transporter = null;
if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
} else {
  console.warn(
    "Warning: SMTP_HOST/SMTP_USER/SMTP_PASS not fully set. Requests to /api/send-email will fail."
  );
}

// Basic per-process rate limiting so a bug (or a bad actor) can't turn
// this into a mass-mailer. Adjust to taste.
const MAX_EMAILS_PER_HOUR = 30;
let sentTimestamps = [];

// ---- Campaign (bulk send) state ----
const jobs = new Map(); // jobId -> { total, sent, failed, skipped, results: [], status }

function makeJobId() {
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function generateDraftText({ name, profession, sender, offer, tone }) {
  const prompt = `You are drafting a first-contact sales outreach email.

Sender: ${sender}
What the sender offers: ${offer}
Desired tone: ${tone}

Recipient's name: ${name}
Recipient's profession: ${profession || "unknown"}

Write in natural English. Keep it under 60 words, reference their profession naturally so it doesn't read as generic spam, end with a low-pressure question, no hashtags or emojis. Return only the message text, nothing else.`;

  const maxAttempts = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          max_completion_tokens: 500,
          reasoning_effort: "low",
        }),
      });

      if ((response.status === 429 || response.status === 503) && attempt < maxAttempts) {
        const waitMs = attempt * 1500; // 1.5s, then 3s
        console.warn(
          `Groq ${response.status} (busy/rate-limited), retrying in ${waitMs}ms — attempt ${attempt}/${maxAttempts}`
        );
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      if (!response.ok) throw new Error("Groq error " + response.status);

      const data = await response.json();
      const text = (data?.choices?.[0]?.message?.content || "").trim();
      if (!text) throw new Error("Empty draft");
      return text;
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, attempt * 1500));
      }
    }
  }

  throw lastError;
}

async function runCampaign(jobId, contacts, { sender, offer, tone, ratePerMinute }) {
  const job = jobs.get(jobId);
  const intervalMs = Math.max(1000, Math.round(60000 / ratePerMinute));

  for (const contact of contacts) {
    // Respect the existing hourly ceiling — skip remaining if hit
    const now = Date.now();
    sentTimestamps = sentTimestamps.filter((t) => now - t < 60 * 60 * 1000);
    if (sentTimestamps.length >= MAX_EMAILS_PER_HOUR) {
      job.results.push({ email: contact.email, status: "skipped", reason: "hourly limit reached" });
      job.skipped += 1;
      continue;
    }

    try {
      const draft = await generateDraftText({ ...contact, sender, offer, tone });
      await transporter.sendMail({
        from: `"${FROM_NAME}" <${SMTP_USER}>`,
        to: contact.email,
        subject: `A quick note from ${sender.split(",")[0]}`,
        text: draft,
      });
      sentTimestamps.push(Date.now());
      job.results.push({ email: contact.email, status: "sent", draft });
      job.sent += 1;
    } catch (err) {
      console.error("Campaign send failed for", contact.email, "-", err.message);
      job.results.push({ email: contact.email, status: "failed", reason: err.message });
      job.failed += 1;
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  job.status = "completed";
}

app.post("/api/generate-draft", async (req, res) => {
  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "Missing 'prompt' string in request body." });
  }
  if (!GROQ_API_KEY) {
    return res.status(500).json({ error: "GROQ_API_KEY is not configured on this server." });
  }

  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_completion_tokens: 500,
        reasoning_effort: "low",
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Groq API error:", response.status, errText);
      return res.status(502).json({ error: "Upstream API error." });
    }

    const data = await response.json();
    const text = (data?.choices?.[0]?.message?.content || "").trim();

    if (!text) {
      return res.status(502).json({ error: "Empty response from model." });
    }

    res.json({ text });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Something went wrong generating the draft." });
  }
});

app.post("/api/send-email", async (req, res) => {
  const { to, subject, text } = req.body || {};

  if (!to || !text) {
    return res.status(400).json({ error: "Missing 'to' or 'text' in request body." });
  }
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(to)) {
    return res.status(400).json({ error: "'to' is not a valid email address." });
  }
  if (!transporter) {
    return res.status(500).json({
      error: "Email is not configured on this server. Set SMTP_HOST, SMTP_USER, SMTP_PASS.",
    });
  }

  const now = Date.now();
  sentTimestamps = sentTimestamps.filter((t) => now - t < 60 * 60 * 1000);
  if (sentTimestamps.length >= MAX_EMAILS_PER_HOUR) {
    return res.status(429).json({ error: "Hourly send limit reached. Try again later." });
  }

  try {
    await transporter.sendMail({
      from: `"${FROM_NAME}" <${SMTP_USER}>`,
      to,
      subject: subject || "A quick note",
      text,
    });
    sentTimestamps.push(now);
    res.json({ success: true });
  } catch (err) {
    console.error("Email send error:", err);
    res.status(502).json({ error: "Failed to send email." });
  }
});

app.post("/api/send-campaign", (req, res) => {
  const { contacts, sender, offer, tone, ratePerMinute } = req.body || {};

  if (!Array.isArray(contacts) || contacts.length === 0) {
    return res.status(400).json({ error: "Provide a non-empty 'contacts' array." });
  }
  if (contacts.length > 500) {
    return res.status(400).json({ error: "Max 500 contacts per campaign." });
  }
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const invalid = contacts.filter((c) => !c.email || !emailPattern.test(c.email));
  if (invalid.length > 0) {
    return res.status(400).json({ error: `${invalid.length} contact(s) have an invalid email.` });
  }
  if (!transporter) {
    return res.status(500).json({ error: "Email is not configured on this server." });
  }

  const jobId = makeJobId();
  const rate = Math.min(Math.max(Number(ratePerMinute) || 10, 1), 20); // clamp 1-20/min
  jobs.set(jobId, {
    total: contacts.length,
    sent: 0,
    failed: 0,
    skipped: 0,
    results: [],
    status: "running",
  });

  runCampaign(jobId, contacts, {
    sender: sender || FROM_NAME,
    offer: offer || "",
    tone: tone || "warm",
    ratePerMinute: rate,
  });

  const etaMinutes = Math.ceil(contacts.length / rate);
  res.json({ jobId, total: contacts.length, ratePerMinute: rate, etaMinutes });
});

app.get("/api/campaign-status/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found." });
  res.json(job);
});

app.listen(PORT, () => {
  console.log(`Outreach assistant backend running on http://localhost:${PORT}`);
});