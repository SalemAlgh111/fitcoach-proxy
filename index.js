const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.ALLOWED_ORIGIN || "*", methods: ["GET", "POST"] }));
app.use(express.json());

app.get("/", (_req, res) => { res.json({ status: "ok", service: "FitCoach AI Proxy" }); });
app.get("/health", (_req, res) => { res.json({ status: "healthy" }); });

app.get("/privacy", (_req, res) => {
  res.send('<!DOCTYPE html><html><head><title>FitCoach AI - Privacy Policy</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:system-ui;max-width:600px;margin:40px auto;padding:0 20px;color:#333}h1{font-size:1.5em}</style></head><body><h1>FitCoach AI — Privacy Policy</h1><p><strong>Last updated:</strong> November 2026</p><p>FitCoach AI is a personal fitness tracking app for a single user.</p><ul><li><strong>Data collected:</strong> Workout logs, body weight, daily habits, and Whoop recovery/sleep/strain data via the Whoop API.</li><li><strong>Data usage:</strong> All data is used solely to provide personalized fitness coaching recommendations.</li><li><strong>Data storage:</strong> Data is stored in a private Supabase database accessible only to the app owner.</li><li><strong>Third parties:</strong> Workout data summaries are sent to Groq AI (Llama 3.3) to generate coaching insights. No personal identifiers are shared.</li><li><strong>Data sharing:</strong> Your data is never sold or shared with third parties for marketing.</li><li><strong>Contact:</strong> For questions, reach out via GitHub at github.com/SalemAlgh111.</li></ul></body></html>');
});

app.post("/api/coach", async (req, res) => {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) return res.status(500).json({ error: "GROQ_API_KEY not configured" });
  try {
    const { messages } = req.body;
    if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: "messages array required" });
    const systemPrompt = { role: "system", content: "You are FitCoach AI, a personal fitness coach. You have access to the user's workout logs, body weight, daily habits, and Whoop recovery data.\n\nYour personality:\n- Direct and practical — no fluff\n- Evidence-based advice\n- Encouraging but honest\n- Focus on progressive overload and consistency\n\nGuidelines:\n- Give specific, actionable advice\n- Reference the user's actual data when available\n- Keep responses concise (2-4 sentences for quick questions, longer for detailed analysis)\n- Use metric units (kg, cm)\n- If you don't have enough data, say so and ask what you need" };
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + GROQ_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [systemPrompt, ...messages], temperature: 0.7, max_tokens: 1024 }),
    });
    if (!groqResponse.ok) { const errorText = await groqResponse.text(); console.error("Groq API error:", groqResponse.status, errorText); return res.status(groqResponse.status).json({ error: "AI service error" }); }
    const data = await groqResponse.json();
    res.json({ reply: data.choices?.[0]?.message?.content || "Sorry, I couldn't generate a response." });
  } catch (err) { console.error("Coach endpoint error:", err); res.status(500).json({ error: "Internal server error" }); }
});

app.post("/api/coach/insights", async (req, res) => {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) return res.status(500).json({ error: "GROQ_API_KEY not configured" });
  try {
    const { userData } = req.body;
    const prompt = "Based on this fitness data, give exactly 3 insights as JSON array:\n" + JSON.stringify(userData, null, 2) + '\n\nReturn ONLY a JSON array with this format:\n[{"type":"daily","title":"Today\'s Recommendation","message":"...","icon":"💪"},{"type":"weekly","title":"Weekly Summary","message":"...","icon":"📊"},{"type":"tip","title":"Coach Tip","message":"...","icon":"💡"}]';
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + GROQ_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role: "system", content: "You are a fitness coach AI. Return ONLY valid JSON, no markdown or explanation." }, { role: "user", content: prompt }], temperature: 0.5, max_tokens: 512 }),
    });
    if (!groqResponse.ok) return res.status(groqResponse.status).json({ error: "AI service error" });
    const data = await groqResponse.json();
    const content = data.choices?.[0]?.message?.content || "[]";
    try { res.json({ insights: JSON.parse(content) }); } catch { res.json({ insights: [{ type: "daily", title: "Today's Recommendation", message: content, icon: "💪" }] }); }
  } catch (err) { console.error("Insights endpoint error:", err); res.status(500).json({ error: "Internal server error" }); }
});

app.listen(PORT, () => { console.log("FitCoach Proxy running on port " + PORT); });
