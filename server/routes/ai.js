import express from 'express';
import { all, get } from '../db.js';
import { handleRouteError, HttpError } from '../http.js';
import {
  MAX_AI_SUGGESTION_ITEMS,
  assertMaxItems,
  parseOptionalString,
  parsePositiveAmount,
  parseRequiredString,
} from '../validation.js';

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
const AI_CATEGORY_MAP = new Map(AI_CATEGORY_LIST.map((category) => [category.toLowerCase(), category]));
const AI_SUGGESTION_CHUNK_SIZE = 30;
const AI_REQUEST_TIMEOUT_MS = 15000;
const MAX_CHAT_MESSAGE_LENGTH = 2000;

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
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

async function fetchWithTimeout(url, options, timeoutMs = AI_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new HttpError(504, 'AI request timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
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
${entries.map((entry) => `ID: ${entry.id}\nOriginal: ${entry.description}\nCleaned: ${entry.cleanedDescription}\nAmount: ${entry.amount}`).join('\n\n')}

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
      responseMimeType: 'application/json',
    },
  };

  const geminiRes = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey.trim()}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
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

    const monthlySubTotal = subscriptions.reduce((sum, subscription) => {
      if (subscription.cycle === 'monthly') return sum + Number(subscription.amount);
      if (subscription.cycle === 'yearly') return sum + Number(subscription.amount) / 12;
      if (subscription.cycle === 'weekly') return sum + Number(subscription.amount) * 4.33;
      return sum + Number(subscription.amount);
    }, 0);

    const goals = all('SELECT category, monthly_limit FROM budget_goals');
    const recentExpenses = all('SELECT description, amount, category, date FROM expenses ORDER BY date DESC LIMIT 20');

    return {
      period: 'last 3 months',
      income: { total: Number(incomeTotal?.total) || 0 },
      expenses: { byCategory: expensesByCategory },
      subscriptions: { list: subscriptions, monthlyTotal: monthlySubTotal },
      budgetGoals: goals,
      recentExpenses,
    };
  } catch (error) {
    console.error('buildFinancialContext error:', error.message);
    return {
      period: 'last 3 months',
      income: { total: 0 },
      expenses: { byCategory: [] },
      subscriptions: { list: [], monthlyTotal: 0 },
      budgetGoals: [],
      recentExpenses: [],
    };
  }
}

router.post('/chat', async (req, res) => {
  try {
    const message = parseRequiredString('message', req.body?.message, { max: MAX_CHAT_MESSAGE_LENGTH });
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey.trim() === '') {
      throw new HttpError(503, 'Gemini API key not configured');
    }

    const context = buildFinancialContext();
    const prompt = `You are a sharp, friendly personal finance advisor. You have access to the user's real financial data below. Give specific, actionable advice. Be concise and direct. Use bullet points when listing multiple things. Format currency values in BRL (R$) unless the user asks otherwise. Do not make up data — only reason from what is provided.

FINANCIAL DATA:
${JSON.stringify(context, null, 2)}

User question: ${message}`;

    const geminiBody = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 1024 },
    };

    let geminiRes;
    try {
      geminiRes = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey.trim()}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(geminiBody),
        }
      );
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }

      throw new HttpError(502, `Network error reaching Gemini API: ${error.message}`);
    }

    const rawBody = await geminiRes.text();
    console.log(`Gemini response status: ${geminiRes.status}`);

    if (!geminiRes.ok) {
      let errorMessage;

      if (geminiRes.status === 429) {
        let retryIn = '';
        try {
          const parsed = JSON.parse(rawBody);
          const retryDetail = parsed?.error?.details?.find((detail) => detail['@type']?.includes('RetryInfo'));
          if (retryDetail?.retryDelay) retryIn = ` retry in ${retryDetail.retryDelay}`;
        } catch {
          // Ignore malformed retry metadata and fall back to the generic guidance below.
        }

        errorMessage = `Rate limit reached for this API key (429 —${retryIn}). Wait about a minute and try again, or check the key's Google project quota.`;
        throw new HttpError(422, errorMessage);
      }

      if (geminiRes.status === 403) {
        throw new HttpError(422, 'API key is invalid or the Gemini API is not enabled for this project.');
      }

      throw new HttpError(502, `Gemini API returned an error (${geminiRes.status}). ${rawBody.slice(0, 200)}`);
    }

    let geminiData;
    try {
      geminiData = JSON.parse(rawBody);
    } catch {
      throw new HttpError(502, 'Received unexpected response from Gemini API.');
    }

    const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new HttpError(502, 'Gemini returned an empty or unexpected response structure.');
    }

    return res.json({ reply: text });
  } catch (error) {
    return handleRouteError(res, error, 'AI request failed');
  }
});

router.get('/ping', (req, res) => res.json({ status: 'ai router ok' }));

router.post('/suggest-categories', async (req, res) => {
  try {
    const rawExpenses = assertMaxItems(req.body?.expenses, MAX_AI_SUGGESTION_ITEMS, 'expenses');
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey.trim() === '') {
      throw new HttpError(503, 'Gemini API key not configured');
    }

    const expenses = rawExpenses.map((expense) => ({
      id: parseRequiredString('id', expense?.id, { max: 80 }),
      description: parseOptionalString(expense?.description, { max: 200, defaultValue: '' }),
      amount: parsePositiveAmount('amount', expense?.amount, { allowZero: true }),
    }));

    const historicalCategoryMap = getHistoricalCategoryMap();
    const suggestions = {};
    const groupedUnknownExpenses = new Map();
    const warnings = [];
    let historyMatches = 0;
    let aiMatches = 0;

    for (const expense of expenses) {
      const description = expense.description.trim();
      const cleanedDescription = cleanDescriptionForCategorization(description);
      const normalizedDescription = normalizeDescription(description);

      if (!normalizedDescription) {
        suggestions[expense.id] = 'Other';
        continue;
      }

      const historicalCategory = historicalCategoryMap.get(normalizedDescription);
      if (historicalCategory) {
        suggestions[expense.id] = historicalCategory;
        historyMatches++;
        continue;
      }

      const existingGroup = groupedUnknownExpenses.get(normalizedDescription);
      if (existingGroup) {
        existingGroup.ids.push(expense.id);
      } else {
        groupedUnknownExpenses.set(normalizedDescription, {
          ids: [expense.id],
          description,
          cleanedDescription: cleanedDescription || description || 'Imported transaction',
          amount: expense.amount,
        });
      }
    }

    const aiQueue = [...groupedUnknownExpenses.values()].map((group) => ({
      id: group.ids[0],
      ids: group.ids,
      description: group.description || 'Imported transaction',
      cleanedDescription: group.cleanedDescription || group.description || 'Imported transaction',
      amount: group.amount,
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
      } catch (error) {
        console.error(`Suggest categories chunk ${index + 1} failed:`, error);
        warnings.push(`Chunk ${index + 1} failed: ${error.message}`);
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
      },
    });
  } catch (error) {
    return handleRouteError(res, error, 'Failed to suggest categories');
  }
});

export default router;
