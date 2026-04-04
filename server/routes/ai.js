import express from 'express';
import { all, get } from '../db.js';
const router = express.Router();

const AI_CATEGORY_LIST = [
  'Food',
  'Housing',
  'Transport',
  'Health',
  'Entertainment',
  'Shopping',
  'Subscriptions',
  'Education',
  'Investments',
  'Other',
];

const AI_CATEGORY_SET = new Set(AI_CATEGORY_LIST);
const AI_CATEGORY_MAP = new Map(AI_CATEGORY_LIST.map(category => [category.toLowerCase(), category]));
const AI_SUGGESTION_CHUNK_SIZE = 30;

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function sanitizeSuggestedCategory(value) {
  if (!value) return null;
  const cleaned = String(value).trim();
  if (AI_CATEGORY_SET.has(cleaned)) return cleaned;
  return AI_CATEGORY_MAP.get(cleaned.toLowerCase()) || null;
}

function cleanDescriptionForCategorization(value) {
  return String(value || '')
    .trim()
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, ' ')
    .replace(/^(compra no (debito|débito|credito|crédito)|compra)\s*-\s*/i, '')
    .replace(/^(pagamento (de )?fatura|pagamento boleto)\s*-\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDescription(value) {
  return cleanDescriptionForCategorization(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b\d{2,}\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseAiJsonObject(text) {
  const cleaned = String(text || '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error('AI returned unexpected JSON shape');
    }
    return parsed;
  } catch (initialError) {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw initialError;
    }
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error('AI returned unexpected JSON shape');
    }
    return parsed;
  }
}

function getHistoricalCategoryMap() {
  const historyRows = all(`
    SELECT description, category, COUNT(*) as count
    FROM expenses
    WHERE description IS NOT NULL AND category IS NOT NULL
    GROUP BY description, category
    ORDER BY count DESC
  `);

  const bestCategoryByKey = new Map();

  for (const row of historyRows) {
    const key = normalizeDescription(row.description);
    const category = sanitizeSuggestedCategory(row.category);
    const count = Number(row.count) || 0;

    if (!key || !category || category === 'Other') continue;

    const current = bestCategoryByKey.get(key);
    if (!current || count > current.count) {
      bestCategoryByKey.set(key, { category, count });
    }
  }

  return new Map(
    [...bestCategoryByKey.entries()].map(([key, value]) => [key, value.category])
  );
}

function buildCategoryPrompt(entries) {
  return `You categorize bank transactions for a personal finance app.
Choose exactly one category from this list:
${AI_CATEGORY_LIST.join(', ')}.

Rules:
- Return ONLY a JSON object.
- Keep every transaction ID exactly as provided.
- Use the category names exactly as written.
- Ignore bank prefixes like "Compra no débito -" and random identifiers.
- If the description is still unclear, use "Other".

Category guide:
- Food: restaurants, grocery stores, cafes, delivery, bakeries, markets.
- Housing: rent, utilities, home services, internet, phone bills, maintenance.
- Transport: ride apps, fuel, parking, tolls, transit, vehicle services.
- Health: pharmacies, hospitals, dentists, labs, clinics, gyms with a medical focus.
- Entertainment: bars, movies, games, events, hobbies, leisure.
- Shopping: retail, ecommerce, clothes, electronics, home goods, marketplaces.
- Subscriptions: recurring software, apps, streaming, memberships.
- Education: courses, books, tuition, schools, training.
- Investments: brokerages, crypto, stocks, retirement contributions.

Transactions:
${entries.map(entry => `ID: ${entry.id}\nOriginal: ${entry.description}\nCleaned: ${entry.cleanedDescription}\nAmount: ${entry.amount}`).join('\n\n')}

Example output:
{
  "${entries[0]?.id ?? '0'}": "Food"
}`;
}

async function requestGeminiCategoryChunk(entries, apiKey) {
  const geminiBody = {
    contents: [{ role: 'user', parts: [{ text: buildCategoryPrompt(entries) }] }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 1024,
      responseMimeType: 'application/json'
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
    throw new Error(`Gemini API error (${geminiRes.status}): ${rawError.slice(0, 200)}`);
  }

  const geminiData = await geminiRes.json();
  const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!text) {
    throw new Error('Empty response from AI');
  }

  const parsed = parseAiJsonObject(text);
  const suggestions = {};

  for (const entry of entries) {
    const category = sanitizeSuggestedCategory(parsed[entry.id]);
    if (category) {
      suggestions[entry.id] = category;
    }
  }

  return suggestions;
}

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

    const historicalCategoryMap = getHistoricalCategoryMap();
    const suggestions = {};
    const groupedUnknownExpenses = new Map();
    const warnings = [];
    let historyMatches = 0;
    let aiMatches = 0;

    for (const expense of expenses) {
      const id = String(expense.id ?? '').trim();
      const description = String(expense.description || '').trim();
      const amount = Number(expense.amount) || 0;
      const cleanedDescription = cleanDescriptionForCategorization(description);
      const normalizedDescription = normalizeDescription(description);

      if (!id) continue;

      if (!normalizedDescription) {
        suggestions[id] = 'Other';
        continue;
      }

      const historicalCategory = historicalCategoryMap.get(normalizedDescription);
      if (historicalCategory) {
        suggestions[id] = historicalCategory;
        historyMatches++;
        continue;
      }

      const existingGroup = groupedUnknownExpenses.get(normalizedDescription);
      if (existingGroup) {
        existingGroup.ids.push(id);
      } else {
        groupedUnknownExpenses.set(normalizedDescription, {
          ids: [id],
          description,
          cleanedDescription: cleanedDescription || description || 'Imported transaction',
          amount
        });
      }
    }

    const aiQueue = [...groupedUnknownExpenses.values()].map(group => ({
      id: group.ids[0],
      ids: group.ids,
      description: group.description || 'Imported transaction',
      cleanedDescription: group.cleanedDescription || group.description || 'Imported transaction',
      amount: group.amount
    }));

    const chunks = chunkArray(aiQueue, AI_SUGGESTION_CHUNK_SIZE);

    for (const [index, chunk] of chunks.entries()) {
      try {
        const chunkSuggestions = await requestGeminiCategoryChunk(chunk, apiKey);
        for (const entry of chunk) {
          const category = chunkSuggestions[entry.id];
          if (!category) continue;
          for (const originalId of entry.ids) {
            suggestions[originalId] = category;
            aiMatches++;
          }
        }
      } catch (chunkError) {
        console.error(`Suggest categories chunk ${index + 1} failed:`, chunkError);
        warnings.push(`Chunk ${index + 1} failed: ${chunkError.message}`);
      }
    }

    return res.json({
      suggestions,
      meta: {
        requested: expenses.length,
        resolved: Object.keys(suggestions).length,
        unresolved: Math.max(expenses.length - Object.keys(suggestions).length, 0),
        historyMatches,
        aiMatches,
        warnings,
      }
    });

  } catch (err) {
    console.error('Suggest categories error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
