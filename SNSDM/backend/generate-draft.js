// Deploy this file as-is in an `api/` folder on Vercel and it becomes
// POST https://your-project.vercel.app/api/generate-draft
// Set GEMINI_API_KEY (and optionally GEMINI_MODEL) in your Vercel project's Environment Variables.

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { prompt } = req.body || {};
  if (!prompt || typeof prompt !== "string") {
    return res.status(400).json({ error: "Missing 'prompt' string in request body." });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";

  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: "GEMINI_API_KEY is not configured on this server." });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error:", response.status, errText);
      return res.status(502).json({ error: "Upstream API error." });
    }

    const data = await response.json();
    const text = (data?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();

    if (!text) {
      return res.status(502).json({ error: "Empty response from model." });
    }

    res.status(200).json({ text });
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Something went wrong generating the draft." });
  }
}