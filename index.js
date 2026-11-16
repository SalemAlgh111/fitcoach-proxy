// =============================================
// FitCoach AI — Proxy Server
// =============================================
// هذا السيرفر يشتغل على Render (مجاني)
// وظيفته: يخفي مفاتيح الـ API عن المتصفح
//
// المتصفح يرسل طلب لهذا السيرفر → السيرفر يرسل لـ Groq/Whoop → يرجع الجواب
// كذا المفتاح ما يطلع للمستخدم أبداً

const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3001;

// =============================================
// CORS — نسمح للتطبيق يرسل طلبات
// =============================================
// بعدين نحدد الدومين بالضبط، الحين نسمح للكل (تطوير)
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGIN || "*",
    methods: ["GET", "POST"],
  })
);

app.use(express.json());

// =============================================
// Health Check — Render يحتاجها
// =============================================
app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "FitCoach AI Proxy" });
});

app.get("/health", (_req, res) => {
  res.json({ status: "healthy" });
});

// =============================================
// POST /api/coach — Groq AI (Llama 3.3 70B)
// =============================================
// المتصفح يرسل: { messages: [...] }
// السيرفر يرسل لـ Groq ويرجع الجواب
app.post("/api/coach", async (req, res) => {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;

  if (!GROQ_API_KEY) {
    return res.status(500).json({ error: "GROQ_API_KEY not configured" });
  }

  try {
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "messages array required" });
    }

    // System prompt — شخصية الكوتش
    const systemPrompt = {
      role: "system",
      content: `You are FitCoach AI, a personal fitness coach. You have access to the user's workout logs, body weight, daily habits, and Whoop recovery data.

Your personality:
- Direct and practical — no fluff
- Evidence-based advice
- Encouraging but honest
- Focus on progressive overload and consistency

Guidelines:
- Give specific, actionable advice
- Reference the user's actual data when available
- Keep responses concise (2-4 sentences for quick questions, longer for detailed analysis)
- Use metric units (kg, cm)
- If you don't have enough data, say so and ask what you need`,
    };

    // نرسل لـ Groq
    const groqResponse = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [systemPrompt, ...messages],
          temperature: 0.7,
          max_tokens: 1024,
        }),
      }
    );

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();
      console.error("Groq API error:", groqResponse.status, errorText);
      return res
        .status(groqResponse.status)
        .json({ error: "AI service error" });
    }

    const data = await groqResponse.json();
    const reply = data.choices?.[0]?.message?.content || "Sorry, I couldn't generate a response.";

    res.json({ reply });
  } catch (err) {
    console.error("Coach endpoint error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// =============================================
// POST /api/coach/insights — توصيات يومية/أسبوعية
// =============================================
// المتصفح يرسل بيانات المستخدم → السيرفر يطلب توصيات من الـ AI
app.post("/api/coach/insights", async (req, res) => {
  const GROQ_API_KEY = process.env.GROQ_API_KEY;

  if (!GROQ_API_KEY) {
    return res.status(500).json({ error: "GROQ_API_KEY not configured" });
  }

  try {
    const { userData } = req.body;

    const prompt = `Based on this fitness data, give exactly 3 insights as JSON array:
${JSON.stringify(userData, null, 2)}

Return ONLY a JSON array with this format:
[
  {"type": "daily", "title": "Today's Recommendation", "message": "...", "icon": "💪"},
  {"type": "weekly", "title": "Weekly Summary", "message": "...", "icon": "📊"},
  {"type": "tip", "title": "Coach Tip", "message": "...", "icon": "💡"}
]`;

    const groqResponse = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content:
                "You are a fitness coach AI. Return ONLY valid JSON, no markdown or explanation.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.5,
          max_tokens: 512,
        }),
      }
    );

    if (!groqResponse.ok) {
      return res.status(groqResponse.status).json({ error: "AI service error" });
    }

    const data = await groqResponse.json();
    const content = data.choices?.[0]?.message?.content || "[]";

    // نحاول نحول الجواب لـ JSON
    try {
      const insights = JSON.parse(content);
      res.json({ insights });
    } catch {
      // لو ما قدر يحوله، نرجع الجواب كنص
      res.json({
        insights: [
          {
            type: "daily",
            title: "Today's Recommendation",
            message: content,
            icon: "💪",
          },
        ],
      });
    }
  } catch (err) {
    console.error("Insights endpoint error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// =============================================
// Start Server
// =============================================
app.listen(PORT, () => {
  console.log(`FitCoach Proxy running on port ${PORT}`);
});
