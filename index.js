const express = require("express");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || "*", methods: ["GET", "POST"] }));
app.use(express.json());

app.get("/", (_req, res) => { res.json({ status: "ok", service: "FitCoach AI Proxy" }); });
app.get("/health", (_req, res) => { res.json({ status: "healthy" }); });

app.get("/privacy", (_req, res) => {
  res.send('<!DOCTYPE html><html><head><title>FitCoach AI - Privacy Policy</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui;max-width:600px;margin:40px auto;padding:0 20px;color:#333}h1{font-size:1.5em}</style></head><body><h1>FitCoach AI — Privacy Policy</h1><p><strong>Last updated:</strong> November 2026</p><p>FitCoach AI is a personal fitness tracking app for a single user.</p><ul><li><strong>Data collected:</strong> Workout logs, body weight, daily habits, and Whoop data.</li><li><strong>Data usage:</strong> Used solely for personalized fitness coaching.</li><li><strong>Data storage:</strong> Private Supabase database.</li><li><strong>Third parties:</strong> Summaries sent to Groq AI. No personal identifiers shared.</li><li><strong>Contact:</strong> github.com/SalemAlgh111</li></ul></body></html>');
});

app.post("/api/coach", async (req, res) => {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) return res.status(500).json({ error: "GROQ_API_KEY not configured" });
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: "messages array required" });
    const systemPrompt = { role: "system", content: "You are FitCoach AI, a personal fitness coach. Direct, evidence-based, encouraging. Use metric units. Keep responses concise." };
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + GROQ_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [systemPrompt, ...messages], temperature: 0.7, max_tokens: 1024 }),
    });
    if (!groqResponse.ok) return res.status(groqResponse.status).json({ error: "AI service error" });
    const data = await groqResponse.json();
    res.json({ reply: data.choices?.[0]?.message?.content || "Sorry, could not respond." });
  } catch (err) { console.error("Coach error:", err); res.status(500).json({ error: "Internal server error" }); }
});

app.post("/api/coach/insights", async (req, res) => {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) return res.status(500).json({ error: "GROQ_API_KEY not configured" });
  try {
    const { userData } = req.body;
    const prompt = "Based on this fitness data, give exactly 3 insights as JSON array:\n" + JSON.stringify(userData, null, 2) + '\n\nReturn ONLY a JSON array: [{"type":"daily","title":"...","message":"...","icon":"💪"},{"type":"weekly","title":"...","message":"...","icon":"📊"},{"type":"tip","title":"...","message":"...","icon":"💡"}]';
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + GROQ_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role: "system", content: "Return ONLY valid JSON." }, { role: "user", content: prompt }], temperature: 0.5, max_tokens: 512 }),
    });
    if (!groqResponse.ok) return res.status(groqResponse.status).json({ error: "AI service error" });
    const data = await groqResponse.json();
    const content = data.choices?.[0]?.message?.content || "[]";
    try { res.json({ insights: JSON.parse(content) }); } catch { res.json({ insights: [{ type: "daily", title: "Recommendation", message: content, icon: "💪" }] }); }
  } catch (err) { console.error("Insights error:", err); res.status(500).json({ error: "Internal server error" }); }
});

// === Whoop OAuth ===
let whoopToken = null;

app.get("/api/whoop/auth", (_req, res) => {
  const clientId = process.env.WHOOP_CLIENT_ID;
  const redirectUri = "https://fitcoach-proxy.onrender.com/api/whoop/callback";
  const scopes = "read:recovery read:cycles read:sleep read:workout read:profile read:body_measurement offline";
  const state = Math.random().toString(36).substring(2, 12);
  res.redirect("https://api.prod.whoop.com/oauth/oauth2/auth?client_id=" + clientId + "&redirect_uri=" + encodeURIComponent(redirectUri) + "&response_type=code&scope=" + encodeURIComponent(scopes) + "&state=" + state);
});

app.get("/api/whoop/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.send("Error: No authorization code. Try again.");
  try {
    const tokenResponse = await fetch("https://api.prod.whoop.com/oauth/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, client_id: process.env.WHOOP_CLIENT_ID, client_secret: process.env.WHOOP_CLIENT_SECRET, redirect_uri: "https://fitcoach-proxy.onrender.com/api/whoop/callback" }),
    });
    if (!tokenResponse.ok) { console.error("Whoop token error:", await tokenResponse.text()); return res.send("Error getting token. Try again."); }
    const tokenData = await tokenResponse.json();
    whoopToken = { access_token: tokenData.access_token, refresh_token: tokenData.refresh_token, expires_at: Date.now() + (tokenData.expires_in * 1000) };
    console.log("Whoop connected!");
    res.send('<!DOCTYPE html><html><head><title>Connected!</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui;text-align:center;padding:60px 20px}h1{color:#22c55e}</style></head><body><h1>Whoop Connected!</h1><p>You can close this window.</p><script>setTimeout(()=>window.close(),3000)</script></body></html>');
  } catch (err) { console.error("Whoop callback error:", err); res.send("Error connecting to Whoop."); }
});

app.get("/api/whoop/data", async (_req, res) => {
  if (!whoopToken) return res.status(401).json({ error: "Whoop not connected", authUrl: "/api/whoop/auth" });
  if (Date.now() > whoopToken.expires_at) {
    try {
      const r = await fetch("https://api.prod.whoop.com/oauth/oauth2/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: whoopToken.refresh_token, client_id: process.env.WHOOP_CLIENT_ID, client_secret: process.env.WHOOP_CLIENT_SECRET }) });
      if (!r.ok) { whoopToken = null; return res.status(401).json({ error: "Token expired, reconnect", authUrl: "/api/whoop/auth" }); }
      const t = await r.json(); whoopToken.access_token = t.access_token; whoopToken.refresh_token = t.refresh_token || whoopToken.refresh_token; whoopToken.expires_at = Date.now() + (t.expires_in * 1000);
    } catch (err) { return res.status(500).json({ error: "Failed to refresh token" }); }
  }
  try {
    const headers = { Authorization: "Bearer " + whoopToken.access_token };
    const [recoveryRes, cycleRes, sleepRes] = await Promise.all([
      fetch("https://api.prod.whoop.com/developer/v1/recovery?limit=1", { headers }),
      fetch("https://api.prod.whoop.com/developer/v1/cycle?limit=1", { headers }),
      fetch("https://api.prod.whoop.com/developer/v1/activity/sleep?limit=1", { headers }),
    ]);
    const recovery = recoveryRes.ok ? await recoveryRes.json() : null;
    const cycle = cycleRes.ok ? await cycleRes.json() : null;
    const sleep = sleepRes.ok ? await sleepRes.json() : null;
    res.json({ connected: true, recovery: recovery?.records?.[0]?.score || null, cycle: cycle?.records?.[0]?.score || null, sleep: sleep?.records?.[0]?.score || null });
  } catch (err) { console.error("Whoop data error:", err); res.status(500).json({ error: "Failed to fetch Whoop data" }); }
});

app.get("/api/whoop/status", (_req, res) => { res.json({ connected: !!whoopToken }); });

app.listen(PORT, () => { console.log("FitCoach Proxy running on port " + PORT); });
