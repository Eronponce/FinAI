import { all, run, get } from './db.js';
import { createImportBatch, upsertEconomicMovement } from './workspace-utils.js';
import { inferCategoryHint } from './category-utils.js';

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
const RULE_CONFIDENCE = 100;
const CSV_CONFIDENCE = 64;
const AI_CONFIDENCE_CAP = 95;

function toIsoDate(dateString) {
  return new Date(`${dateString}T00:00:00Z`).getTime();
}

function safeInteger(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : fallback;
}

function groupBy(items, keyFn) {
  const map = new Map();
  for (const item of items) {
    const key = keyFn(item);
    const bucket = map.get(key);
    if (bucket) {
      bucket.push(item);
    } else {
      map.set(key, [item]);
    }
  }
  return map;
}

export function cleanImportDescription(value) {
  return String(value || '')
    .trim()
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{12,}\b/gi, ' ')
    .replace(/\b(?:nsu|aut|cod|codigo|code|id|transacao|transa[cç][aã]o)\s*[:#-]?\s*[a-z0-9-]+\b/gi, ' ')
    .replace(/^(compra no (debito|credito|debito virtual|credito virtual)|compra|pagamento (de )?fatura|pagamento boleto)\s*[-:]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeImportDescription(value) {
  return cleanImportDescription(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b\d{2,}\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeSuggestedCategory(value) {
  if (!value) return null;
  const cleaned = String(value).trim();
  if (AI_CATEGORY_SET.has(cleaned)) return cleaned;
  return AI_CATEGORY_MAP.get(cleaned.toLowerCase()) || null;
}

function sanitizeConfidence(value) {
  const numeric = safeInteger(value, 0);
  if (numeric <= 0) return 0;
  return Math.max(1, Math.min(AI_CONFIDENCE_CAP, numeric));
}

function parseAiJsonObject(text) {
  const cleaned = String(text || '')
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error('AI returned unexpected JSON');
    }
    return parsed;
  } catch (initialError) {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw initialError;
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error('AI returned unexpected JSON');
    }

    return parsed;
  }
}

async function fetchWithTimeout(url, options, timeoutMs = AI_REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildAiPrompt(entries) {
  return `You categorize bank transactions for a personal finance app.
Choose exactly one category from this list:
${AI_CATEGORY_LIST.join(', ')}.

Return ONLY a JSON object with this shape:
{
  "ENTRY_ID": {
    "category": "Food",
    "confidence": 82,
    "reason": "Short explanation"
  }
}

Rules:
- Keep every ID exactly as provided.
- Use the category names exactly as written.
- Confidence must be an integer from 1 to 99.
- Use high confidence only when the merchant or description is very explicit.
- If the description is ambiguous, lower the confidence.
- If you are unsure, use "Other".

Transactions:
${entries.map((entry) => `ID: ${entry.id}\nOriginal: ${entry.description}\nCleaned: ${entry.cleanedDescription}\nAmount: ${entry.amount}`).join('\n\n')}`;
}

async function requestAiSuggestions(entries, apiKey) {
  if (entries.length === 0) {
    return { suggestions: {}, warnings: [] };
  }

  if (!apiKey || apiKey.trim() === '') {
    return {
      suggestions: {},
      warnings: ['Gemini API key is not configured. Only your saved rules, import history and CSV hints were used.'],
    };
  }

  const warnings = [];
  const suggestions = {};

  for (let index = 0; index < entries.length; index += AI_SUGGESTION_CHUNK_SIZE) {
    const chunk = entries.slice(index, index + AI_SUGGESTION_CHUNK_SIZE);
    const body = {
      contents: [{ role: 'user', parts: [{ text: buildAiPrompt(chunk) }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
      },
    };

    try {
      const response = await fetchWithTimeout(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey.trim()}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );

      if (!response.ok) {
        const rawError = await response.text();
        warnings.push(`AI chunk ${Math.floor(index / AI_SUGGESTION_CHUNK_SIZE) + 1} failed (${response.status}): ${rawError.slice(0, 160)}`);
        continue;
      }

      const payload = await response.json();
      const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        warnings.push(`AI chunk ${Math.floor(index / AI_SUGGESTION_CHUNK_SIZE) + 1} returned an empty response.`);
        continue;
      }

      const parsed = parseAiJsonObject(text);

      for (const entry of chunk) {
        const suggested = parsed[entry.id];
        const category = sanitizeSuggestedCategory(suggested?.category);
        const confidence = sanitizeConfidence(suggested?.confidence);
        const reason = String(suggested?.reason || '').trim();

        if (!category || confidence <= 0) {
          continue;
        }

        suggestions[entry.id] = {
          category,
          confidence,
          reason,
        };
      }
    } catch (error) {
      warnings.push(`AI chunk ${Math.floor(index / AI_SUGGESTION_CHUNK_SIZE) + 1} failed: ${error.message}`);
    }
  }

  return { suggestions, warnings };
}

function buildImportRuleMap() {
  const rows = all('SELECT * FROM import_rules');
  const map = new Map();

  for (const row of rows) {
    map.set(`${row.transaction_type}:${row.normalized_description}`, row);
  }

  return map;
}

function buildExpenseHistoryMap() {
  const rows = all(`
    SELECT description, category, COUNT(*) as count
    FROM expenses
    WHERE description IS NOT NULL
      AND description <> ''
      AND category IS NOT NULL
      AND category <> ''
      AND category <> 'Transfer'
      AND is_transfer = 0
    GROUP BY description, category
    ORDER BY count DESC
  `);

  const map = new Map();

  for (const row of rows) {
    const key = normalizeImportDescription(row.description);
    if (!key) continue;

    const count = safeInteger(row.count, 0);
    const current = map.get(key) || {
      totalCount: 0,
      bestCategory: '',
      bestCount: 0,
    };

    current.totalCount += count;
    if (count > current.bestCount) {
      current.bestCount = count;
      current.bestCategory = row.category;
    }

    map.set(key, current);
  }

  return map;
}

function buildIncomeHistoryMap() {
  const rows = all(`
    SELECT source, recurrence, COUNT(*) as count
    FROM income
    WHERE source IS NOT NULL
      AND source <> ''
      AND recurrence IS NOT NULL
      AND recurrence <> ''
      AND is_transfer = 0
    GROUP BY source, recurrence
    ORDER BY count DESC
  `);

  const map = new Map();

  for (const row of rows) {
    const key = normalizeImportDescription(row.source);
    if (!key) continue;

    const count = safeInteger(row.count, 0);
    const current = map.get(key) || {
      totalCount: 0,
      bestRecurrence: 'one-time',
      bestCount: 0,
    };

    current.totalCount += count;
    if (count > current.bestCount) {
      current.bestCount = count;
      current.bestRecurrence = row.recurrence || 'one-time';
    }

    map.set(key, current);
  }

  return map;
}

function calculateHistoryConfidence(bestCount, totalCount) {
  if (!bestCount || !totalCount) return 0;
  const ratioScore = Math.round((bestCount / totalCount) * 100);
  const volumeBonus = Math.min(totalCount * 3, 10);
  return Math.max(72, Math.min(94, ratioScore - 10 + volumeBonus));
}

export function inferSubscriptionCycle(dates) {
  const ordered = [...new Set(dates)]
    .map((date) => ({ date, value: toIsoDate(date) }))
    .filter((item) => Number.isFinite(item.value))
    .sort((left, right) => left.value - right.value);

  if (ordered.length < 2) {
    return 'monthly';
  }

  const gaps = [];
  for (let index = 1; index < ordered.length; index += 1) {
    const diffDays = Math.round((ordered[index].value - ordered[index - 1].value) / 86_400_000);
    if (diffDays > 0) {
      gaps.push(diffDays);
    }
  }

  if (gaps.length === 0) {
    return 'monthly';
  }

  const averageGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;

  if (averageGap >= 5 && averageGap <= 9) return 'weekly';
  if (averageGap >= 320 && averageGap <= 380) return 'yearly';
  return 'monthly';
}

function buildSubscriptionHistoryMap() {
  const rows = all(`
    SELECT description, date
    FROM expenses
    WHERE category = 'Subscriptions'
      AND description IS NOT NULL
      AND description <> ''
  `);

  const map = new Map();

  for (const row of rows) {
    const key = normalizeImportDescription(row.description);
    if (!key) continue;

    const bucket = map.get(key) || [];
    bucket.push(row.date);
    map.set(key, bucket);
  }

  return map;
}

function buildPreviewGroups(rows) {
  const grouped = groupBy(rows, (row) => `${row.type}:${row.match_key}`);
  const map = new Map();

  for (const [key, bucket] of grouped.entries()) {
    map.set(key, {
      count: bucket.length,
      dates: bucket.map((row) => row.date).filter(Boolean),
    });
  }

  return map;
}

function getRowKey(row) {
  return `${row.type}:${row.match_key}`;
}

function createCategoryDecision({ category, confidence, source, reason }) {
  const finalCategory = sanitizeSuggestedCategory(category) || 'Other';
  const finalConfidence = Math.max(0, Math.min(100, safeInteger(confidence, 0)));

  return {
    category: finalCategory,
    category_confidence: finalConfidence,
    category_source: source,
    category_reason: reason,
    needs_review: finalConfidence < RULE_CONFIDENCE,
  };
}

function createRecurrenceDecision({ recurrence, confidence, source, reason }) {
  return {
    recurrence: recurrence || 'one-time',
    recurrence_confidence: Math.max(0, Math.min(100, safeInteger(confidence, 0))),
    recurrence_source: source,
    recurrence_reason: reason,
  };
}

function prepareBaseRow(row) {
  const matchKey = normalizeImportDescription(row.description) || String(row.id);
  const cleanedDescription = cleanImportDescription(row.description) || row.description;

  return {
    id: String(row.id),
    date: row.date,
    description: row.description,
    cleaned_description: cleanedDescription,
    amount: row.amount,
    type: row.type,
    category: row.type === 'expense' ? row.category || 'Other' : '',
    payment_method: row.type === 'expense' ? row.payment_method || 'other' : 'other',
    recurrence: row.type === 'income' ? row.recurrence || 'one-time' : 'one-time',
    notes: row.notes || '',
    account_id: row.account_id ?? null,
    ignore_dashboard: row.ignore_dashboard ? 1 : 0,
    statement_type: row.statement_type || '',
    institution: row.institution || '',
    external_id: row.external_id || '',
    raw_category: row.raw_category || '',
    source_file: row.source_file || '',
    match_key: matchKey,
    duplicate_count: 1,
    is_subscription: 0,
    subscription_cycle: 'monthly',
    subscription_name: '',
    category_confidence: 0,
    category_source: 'unassigned',
    category_reason: 'No confident category yet.',
    recurrence_confidence: 100,
    recurrence_source: 'default',
    recurrence_reason: 'Default recurrence starts as one-time.',
    needs_review: row.type === 'expense',
  };
}

export async function analyzeImportRows(rows) {
  const importRuleMap = buildImportRuleMap();
  const expenseHistoryMap = buildExpenseHistoryMap();
  const incomeHistoryMap = buildIncomeHistoryMap();
  const subscriptionHistoryMap = buildSubscriptionHistoryMap();
  const previewGroups = buildPreviewGroups(rows.map(prepareBaseRow));
  const preparedRows = rows.map(prepareBaseRow);
  const aiCandidates = [];
  const aiWarnings = [];

  for (const row of preparedRows) {
    const rowKey = getRowKey(row);
    const previewGroup = previewGroups.get(rowKey);
    row.duplicate_count = previewGroup?.count || 1;

    if (row.type === 'income') {
      const rule = importRuleMap.get(`income:${row.match_key}`);
      if (rule?.recurrence) {
        Object.assign(row, createRecurrenceDecision({
          recurrence: rule.recurrence,
          confidence: RULE_CONFIDENCE,
          source: 'rule',
          reason: `Matched your saved income rule for "${rule.sample_description}".`,
        }));
      } else {
        const history = incomeHistoryMap.get(row.match_key);
        if (history?.bestRecurrence && history.bestRecurrence !== 'one-time') {
          Object.assign(row, createRecurrenceDecision({
            recurrence: history.bestRecurrence,
            confidence: calculateHistoryConfidence(history.bestCount, history.totalCount),
            source: 'history',
            reason: `Based on ${history.totalCount} earlier income row(s) with the same source.`,
          }));
        }
      }

      continue;
    }

    const rule = importRuleMap.get(`expense:${row.match_key}`);
    if (rule?.category) {
      Object.assign(row, createCategoryDecision({
        category: rule.category,
        confidence: RULE_CONFIDENCE,
        source: 'rule',
        reason: `Matched your saved category rule for "${rule.sample_description}".`,
      }));
      row.payment_method = rule.payment_method || row.payment_method;
      row.is_subscription = rule.is_subscription ? 1 : Number(rule.category === 'Subscriptions');
      row.subscription_cycle = rule.subscription_cycle || 'monthly';
      row.subscription_name = rule.subscription_name || row.cleaned_description.slice(0, 120);
      continue;
    }

    let currentDecision = null;
    const history = expenseHistoryMap.get(row.match_key);
    if (history?.bestCategory) {
      currentDecision = createCategoryDecision({
        category: history.bestCategory,
        confidence: calculateHistoryConfidence(history.bestCount, history.totalCount),
        source: 'history',
        reason: `Based on ${history.totalCount} earlier expense row(s), ${history.bestCount} of them in ${history.bestCategory}.`,
      });
    }

    const heuristicSuggestion = inferCategoryHint({
      description: row.description,
      cleanedDescription: row.cleaned_description,
      normalizedDescription: row.match_key,
      currentCategory: row.category,
    });

    if (heuristicSuggestion) {
      const heuristicDecision = createCategoryDecision({
        category: heuristicSuggestion.category,
        confidence: heuristicSuggestion.confidence,
        source: 'heuristic',
        reason: heuristicSuggestion.reason,
      });

      if (!currentDecision || heuristicDecision.category_confidence >= currentDecision.category_confidence) {
        currentDecision = heuristicDecision;
      }
    }

    if (row.category && row.category !== 'Other') {
      const csvDecision = createCategoryDecision({
        category: row.category,
        confidence: CSV_CONFIDENCE,
        source: 'csv',
        reason: 'Read from the CSV category column.',
      });

      if (!currentDecision || csvDecision.category_confidence >= currentDecision.category_confidence) {
        currentDecision = csvDecision;
      }
    }

    if (!currentDecision) {
      currentDecision = createCategoryDecision({
        category: 'Other',
        confidence: 0,
        source: 'unassigned',
        reason: 'No confident category yet.',
      });
    }

    Object.assign(row, currentDecision);
    aiCandidates.push({
      id: row.id,
      description: row.description,
      cleanedDescription: row.cleaned_description,
      amount: row.amount,
      match_key: row.match_key,
    });
  }

  const groupedAiCandidates = [...groupBy(aiCandidates, (entry) => entry.match_key).values()].map((bucket) => bucket[0]);
  const { suggestions, warnings } = await requestAiSuggestions(groupedAiCandidates, process.env.GEMINI_API_KEY);
  aiWarnings.push(...warnings);

  const aiByMatchKey = new Map();
  for (const candidate of groupedAiCandidates) {
    const suggestion = suggestions[candidate.id];
    if (!suggestion) continue;
    aiByMatchKey.set(candidate.match_key, suggestion);
  }

  let ruleMatches = 0;
  let historyMatches = 0;
  let csvMatches = 0;
  let aiMatches = 0;
  let reviewRequired = 0;

  for (const row of preparedRows) {
    if (row.type === 'expense') {
      const aiSuggestion = aiByMatchKey.get(row.match_key);
      if (aiSuggestion) {
        const aiDecision = createCategoryDecision({
          category: aiSuggestion.category,
          confidence: Math.min(AI_CONFIDENCE_CAP, aiSuggestion.confidence),
          source: 'ai',
          reason: aiSuggestion.reason || 'Suggested by AI based on the purchase description.',
        });

        if (aiDecision.category_confidence > row.category_confidence) {
          Object.assign(row, aiDecision);
        }
      }

      if (row.category === 'Subscriptions') {
        row.is_subscription = 1;
        const dates = [
          ...(previewGroups.get(getRowKey(row))?.dates || []),
          ...(subscriptionHistoryMap.get(row.match_key) || []),
        ];
        row.subscription_cycle = row.subscription_cycle || inferSubscriptionCycle(dates);
        row.subscription_name = row.subscription_name || row.cleaned_description.slice(0, 120);
      } else {
        row.is_subscription = 0;
        row.subscription_cycle = 'monthly';
        row.subscription_name = '';
      }

      if (row.category_source === 'rule') ruleMatches += 1;
      if (row.category_source === 'history') historyMatches += 1;
      if (row.category_source === 'csv') csvMatches += 1;
      if (row.category_source === 'ai') aiMatches += 1;
      if (row.needs_review) reviewRequired += 1;
    } else if (row.recurrence_source === 'rule') {
      ruleMatches += 1;
    }
  }

  return {
    rows: preparedRows,
    meta: {
      totalRows: preparedRows.length,
      expenseRows: preparedRows.filter((row) => row.type === 'expense').length,
      incomeRows: preparedRows.filter((row) => row.type === 'income').length,
      reviewRequired,
      ruleMatches,
      historyMatches,
      csvMatches,
      aiMatches,
      warnings: aiWarnings,
    },
  };
}

function saveImportRule(row) {
  if (!row.match_key || row.match_key === String(row.id)) {
    return 0;
  }

  run(`
    INSERT INTO import_rules (
      normalized_description,
      sample_description,
      transaction_type,
      category,
      payment_method,
      recurrence,
      is_subscription,
      subscription_cycle,
      subscription_name
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(transaction_type, normalized_description)
    DO UPDATE SET
      sample_description = excluded.sample_description,
      category = excluded.category,
      payment_method = excluded.payment_method,
      recurrence = excluded.recurrence,
      is_subscription = excluded.is_subscription,
      subscription_cycle = excluded.subscription_cycle,
      subscription_name = excluded.subscription_name,
      updated_at = datetime('now')
  `, [
    row.match_key,
    row.description,
    row.type,
    row.type === 'expense' ? row.category : '',
    row.type === 'expense' ? row.payment_method : '',
    row.type === 'income' ? row.recurrence : '',
    row.type === 'expense' && (row.is_subscription || row.category === 'Subscriptions') ? 1 : 0,
    row.type === 'expense' && (row.is_subscription || row.category === 'Subscriptions') ? row.subscription_cycle : 'monthly',
    row.type === 'expense' && (row.is_subscription || row.category === 'Subscriptions') ? row.subscription_name : '',
  ]);

  return 1;
}

function buildSubscriptionCandidates(rows) {
  const subscriptionRows = rows.filter((row) => row.type === 'expense' && (row.is_subscription || row.category === 'Subscriptions'));
  const grouped = groupBy(subscriptionRows, (row) => row.match_key);
  const candidates = [];

  for (const [matchKey, bucket] of grouped.entries()) {
    const ordered = [...bucket].sort((left, right) => toIsoDate(right.date) - toIsoDate(left.date));
    const latest = ordered[0];
    const cycle = latest.subscription_cycle || inferSubscriptionCycle(bucket.map((row) => row.date));

    candidates.push({
      match_key: matchKey,
      name: (latest.subscription_name || latest.cleaned_description || latest.description).slice(0, 120),
      amount: latest.amount,
      cycle,
      category: latest.category || 'Subscriptions',
      renewal_date: latest.date,
      notes: latest.notes || '',
    });
  }

  return candidates;
}

function upsertSubscriptions(rows) {
  const candidates = buildSubscriptionCandidates(rows);
  if (candidates.length === 0) {
    return { created: 0, updated: 0 };
  }

  const existingSubscriptions = all('SELECT * FROM subscriptions');
  const existingByKey = new Map(
    existingSubscriptions.map((item) => [normalizeImportDescription(item.name), item])
  );

  let created = 0;
  let updated = 0;

  for (const candidate of candidates) {
    const existing = existingByKey.get(candidate.match_key);

    if (existing) {
      run(
        'UPDATE subscriptions SET name=?, amount=?, cycle=?, category=?, renewal_date=?, active=1, notes=? WHERE id=?',
        [
          candidate.name,
          candidate.amount,
          candidate.cycle,
          candidate.category,
          candidate.renewal_date,
          candidate.notes,
          existing.id,
        ]
      );
      updated += 1;
      continue;
    }

    run(
      'INSERT INTO subscriptions (name, amount, cycle, category, renewal_date, active, notes) VALUES (?, ?, ?, ?, ?, 1, ?)',
      [
        candidate.name,
        candidate.amount,
        candidate.cycle,
        candidate.category,
        candidate.renewal_date,
        candidate.notes,
      ]
    );
    created += 1;
  }

  return { created, updated };
}

function importExpenseRow(row) {
  const exists = get(
    'SELECT id FROM expenses WHERE date = ? AND amount = ? AND description = ?',
    [row.date, row.amount, row.description]
  );

  if (exists) {
    run(
      'UPDATE expenses SET category = ?, payment_method = ?, notes = ?, account_id = ?, ignore_dashboard = ? WHERE id = ?',
      [row.category, row.payment_method, row.notes, row.account_id, row.ignore_dashboard, exists.id]
    );
    return { imported: 0, skipped: 1, id: exists.id };
  }

  const result = run(
    'INSERT INTO expenses (description, amount, category, date, payment_method, notes, account_id, is_transfer, ignore_dashboard) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)',
    [
      row.description,
      row.amount,
      row.category,
      row.date,
      row.payment_method,
      row.notes,
      row.account_id,
      row.ignore_dashboard,
    ]
  );

  const insertedId = result.lastInsertRowid || get(
    'SELECT id FROM expenses WHERE date = ? AND amount = ? AND description = ? ORDER BY id DESC LIMIT 1',
    [row.date, row.amount, row.description]
  )?.id || null;

  return { imported: 1, skipped: 0, id: insertedId };
}

function importIncomeRow(row) {
  const exists = get(
    'SELECT id FROM income WHERE date = ? AND amount = ? AND source = ?',
    [row.date, row.amount, row.description]
  );

  if (exists) {
    run(
      'UPDATE income SET recurrence = ?, notes = ?, account_id = ?, ignore_dashboard = ? WHERE id = ?',
      [row.recurrence || 'one-time', row.notes, row.account_id, row.ignore_dashboard, exists.id]
    );
    return { imported: 0, skipped: 1, id: exists.id };
  }

  const result = run(
    'INSERT INTO income (source, amount, date, recurrence, notes, account_id, is_transfer, ignore_dashboard) VALUES (?, ?, ?, ?, ?, ?, 0, ?)',
    [
      row.description,
      row.amount,
      row.date,
      row.recurrence || 'one-time',
      row.notes,
      row.account_id,
      row.ignore_dashboard,
    ]
  );

  const insertedId = result.lastInsertRowid || get(
    'SELECT id FROM income WHERE date = ? AND amount = ? AND source = ? ORDER BY id DESC LIMIT 1',
    [row.date, row.amount, row.description]
  )?.id || null;

  return { imported: 1, skipped: 0, id: insertedId };
}

export function commitImportRows(rows, { sourceFile = '' } = {}) {
  let importedExpenses = 0;
  let importedIncome = 0;
  let skippedExpenses = 0;
  let skippedIncome = 0;
  let rulesSaved = 0;
  const batchId = createImportBatch(rows, sourceFile);

  for (const row of rows) {
    rulesSaved += saveImportRule(row);

    if (row.type === 'expense') {
      const result = importExpenseRow(row);
      importedExpenses += result.imported;
      skippedExpenses += result.skipped;
      upsertEconomicMovement(row, {
        legacyKind: 'expense',
        legacyId: result.id,
        batchId,
        sourceFile,
      });
    } else {
      const result = importIncomeRow(row);
      importedIncome += result.imported;
      skippedIncome += result.skipped;
      upsertEconomicMovement(row, {
        legacyKind: 'income',
        legacyId: result.id,
        batchId,
        sourceFile,
      });
    }
  }

  const subscriptions = upsertSubscriptions(rows);

  return {
    imported: {
      expenses: importedExpenses,
      income: importedIncome,
      total: importedExpenses + importedIncome,
    },
    skipped: {
      expenses: skippedExpenses,
      income: skippedIncome,
      total: skippedExpenses + skippedIncome,
    },
    subscriptions,
    rulesSaved,
    batchId,
  };
}
