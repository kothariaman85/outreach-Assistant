import { useState, useRef, useEffect } from "react";

// ---- Design tokens ----
const ink = "#1B2430";      // primary text
const paper = "#EEF0F3";    // page background (cool grey, not cream)
const surface = "#FFFFFF";  // cards
const line = "#D7DBE1";     // hairline borders
const teal = "#2A6F6F";     // primary action / focus
const tealDark = "#1E5252";
const amber = "#C6862B";    // needs-attention / drafted
const sage = "#5C8A66";     // sent / success
const rust = "#B14A3A";     // replied / hot lead
const muted = "#6B7280";    // secondary text

const STATUS_STYLE = {
  new: { color: muted, bg: "#E7E9ED", label: "new" },
  drafted: { color: amber, bg: "#F6E9D3", label: "drafted" },
  sent: { color: sage, bg: "#E1EBE3", label: "sent" },
  replied: { color: rust, bg: "#F3E1DC", label: "replied" },
};

const SEED_LEADS = [
  {
    id: "l1",
    name: "Aoi Tanaka",
    platform: "Instagram",
    handle: "@aoi.tanaka.design",
    language: "ja",
    notes:
      "フリーランスのグラフィックデザイナー。最近、小規模ブランド向けのロゴ制作の投稿が多い。",
    status: "new",
    draft: "",
    updated: "Sep 12",
  },
  {
    id: "l2",
    name: "Marcus Webb",
    platform: "LinkedIn",
    handle: "in/marcuswebb",
    email: "marcus@webbcommerce.example",
    language: "en",
    notes:
      "Runs a 6-person e-commerce brand. Posted last week about struggling with return logistics.",
    status: "drafted",
    draft:
      "Hi Marcus — saw your post about return logistics eating into your week. We built a tool that handles exactly that for small e-commerce teams. Happy to show you a 5-minute walkthrough if useful?",
    updated: "Sep 13",
  },
  {
    id: "l3",
    name: "Rina Kobayashi",
    platform: "X",
    handle: "@rina_k_cafe",
    language: "ja",
    notes: "都内でカフェを2店舗経営。SNS運用を自分でやっていて忙しそうにしている投稿あり。",
    status: "sent",
    draft:
      "はじめまして、Rinaさん。カフェのSNS運用、お忙しそうですね。投稿作成と予約対応を半分自動化できるツールを作っていて、もしよければ簡単にご紹介させてください。",
    updated: "Sep 10",
  },
  {
    id: "l4",
    name: "Devon Price",
    platform: "Instagram",
    handle: "@devonprice.fit",
    language: "en",
    notes: "Personal trainer, 3k followers, recently posted about wanting more online clients.",
    status: "replied",
    draft:
      "Hey Devon — noticed you're looking to grow online coaching clients. We help trainers set up a simple booking + payment flow in a day. Worth a quick chat?",
    updated: "Sep 8",
  },
];

const OFFER_DEFAULT =
  "A lightweight tool that helps small businesses manage bookings and payments in one place.";
const SENDER_DEFAULT = "Jordan, from Northline Studio";
const API_BASE = "http://localhost:3001";

export default function OutreachAssistant() {
  const [view, setView] = useState("queue"); // "queue" | "campaign"
  const [leads, setLeads] = useState(SEED_LEADS);
  const [selectedId, setSelectedId] = useState(SEED_LEADS[1].id);
  const [filter, setFilter] = useState("all");
  const [offer, setOffer] = useState(OFFER_DEFAULT);
  const [sender, setSender] = useState(SENDER_DEFAULT);
  const [tone, setTone] = useState("warm");
  const [generating, setGenerating] = useState(false);
  const [copyState, setCopyState] = useState("idle");
  const [showAdd, setShowAdd] = useState(false);
  const [newLead, setNewLead] = useState({
    name: "",
    platform: "Instagram",
    handle: "",
    email: "",
    language: "en",
    notes: "",
  });
  const [error, setError] = useState("");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState(null); // { type: "success" | "error", message }

  const selected = leads.find((l) => l.id === selectedId) || null;

  const counts = leads.reduce(
    (acc, l) => {
      acc.total += 1;
      acc[l.status] = (acc[l.status] || 0) + 1;
      return acc;
    },
    { total: 0 }
  );

  const visibleLeads =
    filter === "all" ? leads : leads.filter((l) => l.status === filter);

  function updateLead(id, patch) {
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function handleAddLead(e) {
    e.preventDefault();
    if (!newLead.name.trim() || !newLead.handle.trim()) return;
    const lead = {
      id: "l" + Date.now(),
      ...newLead,
      status: "new",
      draft: "",
      updated: "just now",
    };
    setLeads((prev) => [lead, ...prev]);
    setSelectedId(lead.id);
    setNewLead({ name: "", platform: "Instagram", handle: "", email: "", language: "en", notes: "" });
    setShowAdd(false);
  }

  async function generateDraft() {
    if (!selected) return;
    setGenerating(true);
    setError("");
    const languageInstruction =
      selected.language === "ja"
        ? "Write the message in natural, polite Japanese."
        : "Write the message in natural English.";

    const prompt = `You are drafting a first-contact sales outreach DM for a social media platform (${selected.platform}).

Sender: ${sender}
What the sender offers: ${offer}
Desired tone: ${tone}

Lead's name: ${selected.name}
Notes about the lead (from their public profile/posts): ${selected.notes || "none"}

${languageInstruction}
Keep it under 60 words, reference something specific from the notes so it doesn't read as generic spam, end with a low-pressure question, and do not use hashtags or emojis. Return only the message text, nothing else.`;

    try {
      const response = await fetch(`${API_BASE}/api/generate-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Request failed");
      const text = (data.text || "").trim();
      if (!text) throw new Error("Empty response");
      updateLead(selected.id, { draft: text, status: "drafted" });
    } catch (err) {
      setError("Couldn't generate a draft just now. You can write one manually below.");
    } finally {
      setGenerating(false);
    }
  }

  async function copyDraft() {
    if (!selected?.draft) return;
    try {
      await navigator.clipboard.writeText(selected.draft);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 1500);
    } catch (err) {
      setCopyState("failed");
      setTimeout(() => setCopyState("idle"), 1500);
    }
  }

  function markSent() {
    if (!selected) return;
    updateLead(selected.id, { status: "sent", updated: "just now" });
  }

  async function sendEmail() {
    if (!selected?.email || !selected?.draft) return;
    const confirmed = window.confirm(
      `Send a real email to ${selected.email}?\n\nThis will actually deliver the message below from your connected account.`
    );
    if (!confirmed) return;

    setSendingEmail(true);
    setEmailStatus(null);
    try {
      const response = await fetch(`${API_BASE}/api/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: selected.email,
          subject: `A quick note from ${sender.split(",")[0]}`,
          text: selected.draft,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Send failed");
      updateLead(selected.id, { status: "sent", updated: "just now" });
      setEmailStatus({ type: "success", message: `Sent to ${selected.email}.` });
    } catch (err) {
      setEmailStatus({
        type: "error",
        message: "Couldn't send — this backend endpoint isn't connected in this preview. See the README for setup.",
      });
    } finally {
      setSendingEmail(false);
    }
  }

  return (
    <div style={{ background: paper, color: ink, minHeight: "100%" }} className="font-sans">
      <div className="max-w-6xl mx-auto p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h1 className="text-xl font-semibold" style={{ color: ink }}>
              Outreach queue
            </h1>
            <p className="text-sm mt-1" style={{ color: muted }}>
              {view === "queue"
                ? "Draft and track social DMs. Every message is reviewed and sent by you — nothing here posts to a platform automatically."
                : "Send a rate-limited email campaign to your own contact list."}
            </p>
          </div>
          <div className="flex gap-2 items-start">
            <div className="flex rounded border overflow-hidden" style={{ borderColor: line }}>
              <button
                onClick={() => setView("queue")}
                className="text-sm px-3 py-2"
                style={{
                  background: view === "queue" ? ink : surface,
                  color: view === "queue" ? paper : ink,
                }}
              >
                Queue
              </button>
              <button
                onClick={() => setView("campaign")}
                className="text-sm px-3 py-2"
                style={{
                  background: view === "campaign" ? ink : surface,
                  color: view === "campaign" ? paper : ink,
                }}
              >
                Campaign
              </button>
            </div>
            {view === "queue" && (
              <button
                onClick={() => setShowAdd((s) => !s)}
                className="text-sm px-3 py-2 rounded"
                style={{ background: ink, color: paper }}
              >
                {showAdd ? "Cancel" : "Add lead"}
              </button>
            )}
          </div>
        </div>

        {view === "queue" ? (
          <QueueView
            leads={leads}
            visibleLeads={visibleLeads}
            counts={counts}
            filter={filter}
            setFilter={setFilter}
            showAdd={showAdd}
            newLead={newLead}
            setNewLead={setNewLead}
            handleAddLead={handleAddLead}
            selected={selected}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            sender={sender}
            setSender={setSender}
            tone={tone}
            setTone={setTone}
            offer={offer}
            setOffer={setOffer}
            updateLead={updateLead}
            generateDraft={generateDraft}
            generating={generating}
            copyDraft={copyDraft}
            copyState={copyState}
            sendEmail={sendEmail}
            sendingEmail={sendingEmail}
            markSent={markSent}
            emailStatus={emailStatus}
            error={error}
          />
        ) : (
          <CampaignView sender={sender} offer={offer} tone={tone} />
        )}
      </div>
    </div>
  );
}

function QueueView({
  visibleLeads,
  counts,
  filter,
  setFilter,
  showAdd,
  newLead,
  setNewLead,
  handleAddLead,
  selected,
  selectedId,
  setSelectedId,
  sender,
  setSender,
  tone,
  setTone,
  offer,
  setOffer,
  updateLead,
  generateDraft,
  generating,
  copyDraft,
  copyState,
  sendEmail,
  sendingEmail,
  markSent,
  emailStatus,
  error,
}) {
  return (
    <>
      {showAdd && (
        <form
          onSubmit={handleAddLead}
          className="mb-5 p-4 rounded border grid grid-cols-1 md:grid-cols-6 gap-3"
          style={{ background: surface, borderColor: line }}
        >
          <input
            placeholder="Name"
            value={newLead.name}
            onChange={(e) => setNewLead({ ...newLead, name: e.target.value })}
            className="border rounded px-2 py-1.5 text-sm"
            style={{ borderColor: line }}
          />
          <select
            value={newLead.platform}
            onChange={(e) => setNewLead({ ...newLead, platform: e.target.value })}
            className="border rounded px-2 py-1.5 text-sm"
            style={{ borderColor: line }}
          >
            <option>Instagram</option>
            <option>X</option>
            <option>LinkedIn</option>
            <option>Facebook</option>
          </select>
          <input
            placeholder="Handle / profile"
            value={newLead.handle}
            onChange={(e) => setNewLead({ ...newLead, handle: e.target.value })}
            className="border rounded px-2 py-1.5 text-sm"
            style={{ borderColor: line }}
          />
          <input
            placeholder="Email (optional)"
            value={newLead.email}
            onChange={(e) => setNewLead({ ...newLead, email: e.target.value })}
            className="border rounded px-2 py-1.5 text-sm"
            style={{ borderColor: line }}
          />
          <select
            value={newLead.language}
            onChange={(e) => setNewLead({ ...newLead, language: e.target.value })}
            className="border rounded px-2 py-1.5 text-sm"
            style={{ borderColor: line }}
          >
            <option value="en">English</option>
            <option value="ja">Japanese</option>
          </select>
          <input
            placeholder="Notes from their profile"
            value={newLead.notes}
            onChange={(e) => setNewLead({ ...newLead, notes: e.target.value })}
            className="border rounded px-2 py-1.5 text-sm md:col-span-6"
            style={{ borderColor: line }}
          />
          <button
            type="submit"
            className="text-sm px-3 py-1.5 rounded md:col-span-6 justify-self-start"
            style={{ background: teal, color: "#fff" }}
          >
            Save lead
          </button>
        </form>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <StatCard label="total" value={counts.total} color={ink} active={filter === "all"} onClick={() => setFilter("all")} />
        <StatCard label="new" value={counts.new || 0} color={muted} active={filter === "new"} onClick={() => setFilter("new")} />
        <StatCard label="drafted" value={counts.drafted || 0} color={amber} active={filter === "drafted"} onClick={() => setFilter("drafted")} />
        <StatCard label="sent" value={counts.sent || 0} color={sage} active={filter === "sent"} onClick={() => setFilter("sent")} />
        <StatCard label="replied" value={counts.replied || 0} color={rust} active={filter === "replied"} onClick={() => setFilter("replied")} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
        {/* Lead list */}
        <div className="md:col-span-2 rounded border overflow-hidden" style={{ borderColor: line, background: surface }}>
          {visibleLeads.length === 0 && (
            <div className="p-4 text-sm" style={{ color: muted }}>
              No leads in this view yet.
            </div>
          )}
          {visibleLeads.map((lead) => {
            const st = STATUS_STYLE[lead.status];
            const isSelected = lead.id === selectedId;
            return (
              <button
                key={lead.id}
                onClick={() => setSelectedId(lead.id)}
                className="w-full text-left p-3 flex items-center justify-between border-b"
                style={{
                  borderColor: line,
                  background: isSelected ? paper : "transparent",
                }}
              >
                <div>
                  <div className="text-sm font-medium">{lead.name}</div>
                  <div className="text-xs mt-0.5 font-mono" style={{ color: muted }}>
                    {lead.platform} · {lead.handle}
                  </div>
                </div>
                <span
                  className="text-xs px-2 py-0.5 rounded font-mono"
                  style={{ color: st.color, background: st.bg }}
                >
                  {st.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Detail / composer */}
        <div className="md:col-span-3 rounded border p-4" style={{ borderColor: line, background: surface }}>
          {!selected ? (
            <div className="text-sm" style={{ color: muted }}>
              Select a lead to draft a message.
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold">{selected.name}</h2>
                  <div className="text-xs font-mono mt-0.5" style={{ color: muted }}>
                    {selected.platform} · {selected.handle} · updated {selected.updated}
                    {selected.email ? ` · ${selected.email}` : ""}
                  </div>
                </div>
                <span
                  className="text-xs px-2 py-0.5 rounded font-mono"
                  style={{
                    color: STATUS_STYLE[selected.status].color,
                    background: STATUS_STYLE[selected.status].bg,
                  }}
                >
                  {STATUS_STYLE[selected.status].label}
                </span>
              </div>

              <p className="text-sm mt-3" style={{ color: ink }}>
                {selected.notes || "No notes yet for this lead."}
              </p>

              <div className="mt-4 pt-4 border-t" style={{ borderColor: line }}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
                  <div>
                    <label className="text-xs" style={{ color: muted }}>From</label>
                    <input
                      value={sender}
                      onChange={(e) => setSender(e.target.value)}
                      className="w-full border rounded px-2 py-1 text-sm mt-0.5"
                      style={{ borderColor: line }}
                    />
                  </div>
                  <div className="md:col-span-1">
                    <label className="text-xs" style={{ color: muted }}>Tone</label>
                    <select
                      value={tone}
                      onChange={(e) => setTone(e.target.value)}
                      className="w-full border rounded px-2 py-1 text-sm mt-0.5"
                      style={{ borderColor: line }}
                    >
                      <option value="warm">Warm</option>
                      <option value="direct">Direct</option>
                      <option value="playful">Playful</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs" style={{ color: muted }}>What you offer</label>
                    <input
                      value={offer}
                      onChange={(e) => setOffer(e.target.value)}
                      className="w-full border rounded px-2 py-1 text-sm mt-0.5"
                      style={{ borderColor: line }}
                    />
                  </div>
                </div>

                <label className="text-xs" style={{ color: muted }}>Draft message</label>
                <textarea
                  value={selected.draft}
                  onChange={(e) => updateLead(selected.id, { draft: e.target.value })}
                  rows={4}
                  placeholder="No draft yet — generate one or write your own."
                  className="w-full border rounded px-2 py-2 text-sm mt-0.5"
                  style={{ borderColor: line }}
                />
                {error && (
                  <div className="text-xs mt-1" style={{ color: rust }}>
                    {error}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 mt-3">
                  <button
                    onClick={generateDraft}
                    disabled={generating}
                    className="text-sm px-3 py-1.5 rounded"
                    style={{ background: teal, color: "#fff", opacity: generating ? 0.6 : 1 }}
                  >
                    {generating ? "Drafting…" : selected.draft ? "Regenerate draft" : "Generate draft"}
                  </button>
                  <button
                    onClick={copyDraft}
                    disabled={!selected.draft}
                    className="text-sm px-3 py-1.5 rounded border"
                    style={{ borderColor: line, color: ink, opacity: selected.draft ? 1 : 0.5 }}
                  >
                    {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy to clipboard"}
                  </button>
                  {selected.email ? (
                    <button
                      onClick={sendEmail}
                      disabled={!selected.draft || sendingEmail}
                      className="text-sm px-3 py-1.5 rounded"
                      style={{
                        background: selected.draft ? tealDark : line,
                        color: "#fff",
                        opacity: sendingEmail ? 0.6 : 1,
                      }}
                    >
                      {sendingEmail ? "Sending…" : "Send email"}
                    </button>
                  ) : (
                    <button
                      onClick={markSent}
                      disabled={!selected.draft}
                      className="text-sm px-3 py-1.5 rounded"
                      style={{
                        background: selected.draft ? sage : line,
                        color: "#fff",
                      }}
                    >
                      I sent this
                    </button>
                  )}
                </div>
                {emailStatus && (
                  <div
                    className="text-xs mt-2"
                    style={{ color: emailStatus.type === "success" ? sage : rust }}
                  >
                    {emailStatus.message}
                  </div>
                )}
                <p className="text-xs mt-3" style={{ color: muted }}>
                  {selected.email
                    ? "\"Send email\" actually delivers this message through your connected mail account — you'll get a confirmation prompt first."
                    : `"I sent this" only updates your tracker — it doesn't post anything. Paste the message into ${selected.platform} yourself once you're happy with it.`}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ---- Campaign view: bulk, rate-limited email sending to your own list ----
function parseContactsText(text) {
  // Accepts CSV-ish lines: name,email,profession (header row optional)
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const contacts = [];
  for (const line of lines) {
    const parts = line.split(",").map((p) => p.trim());
    if (parts.length < 2) continue;
    const [name, email, profession] = parts;
    if (/name/i.test(name) && /email/i.test(email)) continue; // skip header row
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    contacts.push({ name: name || "", email, profession: profession || "" });
  }
  return contacts;
}

function CampaignView({ sender, offer, tone }) {
  const [raw, setRaw] = useState("");
  const [ratePerMinute, setRatePerMinute] = useState(10);
  const [contacts, setContacts] = useState([]);
  const [parseError, setParseError] = useState("");
  const [job, setJob] = useState(null); // { jobId, total, ratePerMinute, etaMinutes }
  const [status, setStatus] = useState(null); // polled job status
  const [launchError, setLaunchError] = useState("");
  const [launching, setLaunching] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => {
    const parsed = parseContactsText(raw);
    setContacts(parsed);
    setParseError(raw.trim() && parsed.length === 0 ? "No valid rows found — check the format below." : "");
  }, [raw]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function pollStatus(jobId) {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/campaign-status/${jobId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Status check failed");
        setStatus(data);
        if (data.status === "completed") {
          clearInterval(pollRef.current);
        }
      } catch (err) {
        clearInterval(pollRef.current);
        setLaunchError("Lost connection while checking campaign progress.");
      }
    }, 2000);
  }

  async function launchCampaign() {
    if (contacts.length === 0) return;
    const confirmed = window.confirm(
      `Send to ${contacts.length} contact(s) at ${ratePerMinute}/minute?\n\nEach message is AI-drafted per person and sent through your connected mail account.`
    );
    if (!confirmed) return;

    setLaunching(true);
    setLaunchError("");
    setStatus(null);
    try {
      const res = await fetch(`${API_BASE}/api/send-campaign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contacts, sender, offer, tone, ratePerMinute }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't start campaign");
      setJob(data);
      setStatus({ total: data.total, sent: 0, failed: 0, skipped: 0, results: [], status: "running" });
      pollStatus(data.jobId);
    } catch (err) {
      setLaunchError(err.message || "Couldn't start the campaign. Is the backend running?");
    } finally {
      setLaunching(false);
    }
  }

  const progressDone = status ? status.sent + status.failed + status.skipped : 0;
  const progressPct = status && status.total ? Math.round((progressDone / status.total) * 100) : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-5">
      <div className="md:col-span-2 rounded border p-4" style={{ borderColor: line, background: surface }}>
        <label className="text-xs" style={{ color: muted }}>
          Contact list — one per line: name, email, profession
        </label>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={10}
          placeholder={"Rina Kobayashi, rina@cafe-example.com, Cafe owner\nMarcus Webb, marcus@webbcommerce.example, E-commerce founder"}
          className="w-full border rounded px-2 py-2 text-sm mt-1 font-mono"
          style={{ borderColor: line }}
        />
        {parseError && (
          <div className="text-xs mt-1" style={{ color: rust }}>{parseError}</div>
        )}
        <div className="text-xs mt-1" style={{ color: muted }}>
          {contacts.length} valid contact{contacts.length === 1 ? "" : "s"} recognized
          {contacts.length > 500 ? " — max 500 per campaign, extra rows will be ignored." : ""}
        </div>

        <div className="mt-4 pt-4 border-t" style={{ borderColor: line }}>
          <label className="text-xs" style={{ color: muted }}>Send rate</label>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="range"
              min={1}
              max={20}
              value={ratePerMinute}
              onChange={(e) => setRatePerMinute(Number(e.target.value))}
              className="flex-1"
            />
            <span className="text-sm font-mono w-24 text-right" style={{ color: ink }}>
              {ratePerMinute}/min
            </span>
          </div>
          <div className="text-xs mt-1" style={{ color: muted }}>
            Sends one email every {Math.round(60 / ratePerMinute)}s. Capped by your server's 30/hour limit too.
          </div>
        </div>

        <button
          onClick={launchCampaign}
          disabled={contacts.length === 0 || launching || (status && status.status === "running")}
          className="text-sm px-3 py-1.5 rounded mt-4"
          style={{
            background: contacts.length > 0 ? tealDark : line,
            color: "#fff",
            opacity: launching ? 0.6 : 1,
          }}
        >
          {launching ? "Starting…" : status && status.status === "running" ? "Campaign running…" : "Run campaign"}
        </button>
        {launchError && (
          <div className="text-xs mt-2" style={{ color: rust }}>{launchError}</div>
        )}
        <p className="text-xs mt-3" style={{ color: muted }}>
          Only send to people who know you or expect to hear from you. Each contact gets a personalized draft — you're responsible for what goes out under your name.
        </p>
      </div>

      <div className="md:col-span-3 rounded border p-4" style={{ borderColor: line, background: surface }}>
        {!status ? (
          <div className="text-sm" style={{ color: muted }}>
            Paste a contact list and run a campaign to see live progress here.
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-base font-semibold">
                {status.status === "completed" ? "Campaign complete" : "Sending…"}
              </h2>
              <span className="text-xs font-mono" style={{ color: muted }}>
                {progressDone} / {status.total}
              </span>
            </div>
            <div className="w-full rounded h-2 overflow-hidden" style={{ background: paper }}>
              <div
                className="h-2"
                style={{ width: `${progressPct}%`, background: teal, transition: "width 0.3s" }}
              />
            </div>

            <div className="grid grid-cols-3 gap-3 mt-4">
              <MiniStat label="sent" value={status.sent} color={sage} />
              <MiniStat label="failed" value={status.failed} color={rust} />
              <MiniStat label="skipped" value={status.skipped} color={amber} />
            </div>

            <div className="mt-4 pt-4 border-t max-h-64 overflow-y-auto" style={{ borderColor: line }}>
              {status.results.length === 0 ? (
                <div className="text-xs" style={{ color: muted }}>No results yet.</div>
              ) : (
                status.results.map((r, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-1.5 border-b text-sm"
                    style={{ borderColor: line }}
                  >
                    <span className="font-mono text-xs" style={{ color: ink }}>{r.email}</span>
                    <span
                      className="text-xs px-2 py-0.5 rounded font-mono"
                      style={{
                        color:
                          r.status === "sent" ? sage : r.status === "failed" ? rust : amber,
                        background:
                          r.status === "sent" ? "#E1EBE3" : r.status === "failed" ? "#F3E1DC" : "#F6E9D3",
                      }}
                    >
                      {r.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <div className="rounded border p-2 text-center" style={{ borderColor: line }}>
      <div className="text-base font-semibold font-mono" style={{ color }}>{value}</div>
      <div className="text-xs" style={{ color: muted }}>{label}</div>
    </div>
  );
}

function StatCard({ label, value, color, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className="text-left rounded border p-3"
      style={{
        borderColor: active ? color : line,
        background: surface,
      }}
    >
      <div className="text-lg font-semibold font-mono" style={{ color }}>
        {value}
      </div>
      <div className="text-xs mt-0.5" style={{ color: muted }}>
        {label}
      </div>
    </button>
  );
}
