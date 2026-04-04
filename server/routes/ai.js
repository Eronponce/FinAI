import express from 'express';
import { all, get } from '../db.js';
const router = express.Router();

function buildFinancialContext() {
  try {
    const expensesByCategory = all(`
      SELECT category, SUM(amount) as total, COUNT(*) as count
      FROM expenses
      WHERE date >= date('now', '-3 months')
      GROUP BY category
      ORDER BY total DESC
    `);

    const incomeTotal = get(`SELECT SUM(amount) as total FROM income WHERE date >= date('now', '-3 months')`);
    const subscriptions = all(`SELECT name, amount, cycle FROM subscriptions WHERE active=1`);

    const monthlySubTotal = subscriptions.reduce((sum, s) => {
      if (s.cycle === 'monthly') return sum + Number(s.amount);
      if (s.cycle === 'yearly')  return sum + Number(s.amount) / 12;
      if (s.cycle === 'weekly')  return sum + Number(s.amount) * 4.33;
      return sum + Number(s.amount);
    }, 0);

    const goals = all('SELECT category, monthly_limit FROM budget_goals');
    const recentExpenses = all(`SELECT description, amount, category, date FROM expenses ORDER BY date DESC LIMIT 20`);

    return {
      period: 'last 3 months',
      income: { total: Number(incomeTotal?.total) || 0 },
      expenses: { byCategory: expensesByCategory },
      subscriptions: { list: subscriptions, monthlyTotal: monthlySubTotal },
      budgetGoals: goals,
      recentExpenses
    };
  } catch (e) {
    console.error('buildFinancialContext error:', e.message);
    return {
      period: 'last 3 months',
      income: { total: 0 },
      expenses: { byCategory: [] },
      subscriptions: { list: [], monthlyTotal: 0 },
      budgetGoals: [],
      recentExpenses: []
    };
  }
}

router.post('/chat', async (req, res) => {
  // Defensive: always send a response even on unexpected errors
  try {
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'message is required' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.trim() === '') {
      return res.status(503).json({
        error: 'Gemini API key not configured — add GEMINI_API_KEY to your .env file',
        setup_url: 'https://aistudio.google.com/app/apikey'
      });
    }

    const context = buildFinancialContext();

    const prompt = `You are a sharp, friendly personal finance advisor. You have access to the user's real financial data below. Give specific, actionable advice. Be concise and direct. Use bullet points when listing multiple things. Format currency values in BRL (R$) unless the user asks otherwise. Do not make up data — only reason from what is provided.

FINANCIAL DATA:
${JSON.stringify(context, null, 2)}

User question: ${message}`;

    const geminiBody = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
    };

    let geminiRes;
    try {
      geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey.trim()}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geminiBody)
        }
      );
    } catch (networkErr) {
      console.error('Gemini network error:', networkErr.message);
      return res.status(502).json({ error: `Network error reaching Gemini API: ${networkErr.message}` });
    }

    const rawBody = await geminiRes.text();
    console.log(`Gemini response status: ${geminiRes.status}`);

    if (!geminiRes.ok) {
      console.error('Gemini API error:', rawBody);
      let errorMsg;
      if (geminiRes.status === 429) {
        // Extract retry delay if present
        let retryIn = '';
        try {
          const parsed = JSON.parse(rawBody);
          const retryDetail = parsed?.error?.details?.find(d => d['@type']?.includes('RetryInfo'));
          if (retryDetail?.retryDelay) retryIn = ` retry in ${retryDetail.retryDelay}`;
        } catch {}
        errorMsg = `Rate limit reached for this API key (429 —${retryIn}). This usually means:\n• You've hit the free-tier per-minute limit — wait ~1 minute and try again\n• Or your project has 0 free quota — enable billing at console.cloud.google.com or create a new API key from a different Google project at aistudio.google.com/app/apikey`;
      } else if (geminiRes.status === 403) {
        errorMsg = 'API key is invalid or the Gemini API is not enabled for this project. Check your key at aistudio.google.com/app/apikey';
      } else {
        errorMsg = `Gemini API returned an error (${geminiRes.status}). ${rawBody.slice(0, 200)}`;
      }
      return res.status(422).json({ error: errorMsg });
    }

    let geminiData;
    try {
      geminiData = JSON.parse(rawBody);
    } catch (parseErr) {
      console.error('Failed to parse Gemini JSON:', rawBody.slice(0, 200));
      return res.status(502).json({ error: 'Received unexpected response from Gemini API.' });
    }

    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error('Unexpected Gemini response structure:', JSON.stringify(geminiData).slice(0, 300));
      return res.status(502).json({ error: 'Gemini returned an empty or unexpected response structure.' });
    }

    return res.json({ reply: text });

  } catch (err) {
    // Last-resort catch — always send JSON
    console.error('AI route unhandled error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: `Server error: ${err.message}` });
    }
  }
});

router.get('/ping', (req, res) => res.json({ status: 'ai router ok' }));
router.post('/suggest-categories', async (req, res) => {
  console.log('--- AI SUGGEST CATEGORIES REQUEST RECEIVED ---');
  try {
    const { expenses } = req.body;

    if (!expenses || !Array.isArray(expenses) || expenses.length === 0) {
      return res.status(400).json({ error: 'expenses array is required' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey.trim() === '') {
      return res.status(503).json({
        error: 'Gemini API key not configured',
      });
    }

    const CATEGORIES_LIST = [
      'Food', 'Housing', 'Transport', 'Health', 'Entertainment',
      'Shopping', 'Subscriptions', 'Education', 'Investments', 'Other'
    ];

    const prompt = `You are a personal finance assistant. Given a list of expense descriptions, suggest the most appropriate category from the following list:
${CATEGORIES_LIST.join(', ')}.

Return ONLY a JSON object where keys are the expense IDs and values are the suggested category names.

Expenses:
${expenses.map(e => `ID: ${e.id}, Description: ${e.description}, Amount: ${e.amount}`).join('\n')}

Example Output:
{
  "0": "Food",
  "1": "Transport"
}`;

    const geminiBody = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 2048,
        response_mime_type: "application/json"
      }
    };

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey.trim()}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody)
      }
    );

    if (!geminiRes.ok) {
      const rawError = await geminiRes.text();
      console.error('Gemini API error in suggest-categories:', rawError);
      return res.status(geminiRes.status).json({ error: 'Failed to get suggestions from AI' });
    }

    const geminiData = await geminiRes.json();
    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return res.status(502).json({ error: 'Empty response from AI' });
    }

    try {
      const suggestions = JSON.parse(text);
      return res.json({ suggestions });
    } catch (parseErr) {
      console.error('Failed to parse AI JSON:', text);
      return res.status(502).json({ error: 'AI returned invalid JSON format' });
    }

  } catch (err) {
    console.error('Suggest categories error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
