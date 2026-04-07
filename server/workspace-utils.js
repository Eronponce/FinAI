import { all, get, run } from './db.js';
import { inferCategoryHint } from './category-utils.js';

export const ECONOMIC_TYPES = [
  'consumption_expense',
  'external_income',
  'reimbursement_in',
  'reimbursement_out',
  'internal_transfer_in',
  'internal_transfer_out',
  'investment_contribution',
  'investment_redemption',
  'card_payment',
  'refund',
  'unknown',
];

const ECONOMIC_META = {
  consumption_expense: { label: 'Real spend', bucket: 'spend', category: 'Other' },
  external_income: { label: 'Real income', bucket: 'income', category: 'Other' },
  reimbursement_in: { label: 'Reimbursement in', bucket: 'reimbursement', category: 'Other' },
  reimbursement_out: { label: 'Reimbursement out', bucket: 'reimbursement_out', category: 'Other' },
  internal_transfer_in: { label: 'Internal transfer in', bucket: 'internal_transfer_in', category: 'Transfer' },
  internal_transfer_out: { label: 'Internal transfer out', bucket: 'internal_transfer_out', category: 'Transfer' },
  investment_contribution: { label: 'Investment contribution', bucket: 'investment_out', category: 'Investments' },
  investment_redemption: { label: 'Investment redemption', bucket: 'investment_in', category: 'Investments' },
  card_payment: { label: 'Card payment', bucket: 'card_payment', category: 'Transfer' },
  refund: { label: 'Refund', bucket: 'refund', category: 'Other' },
  unknown: { label: 'Unknown', bucket: 'unknown', category: 'Other' },
};

const OWN_NAME_MARKERS = ['eron ponce pereira', 'eron ponce', 'eronp'];
const CORPORATE_MARKERS = [
  'ltda',
  's a',
  'sa ',
  'servicos',
  'tecnologia',
  'mercado pago',
  'pagseguro',
  'pagbank',
  'booking',
  'google',
  'openai',
  'uber',
  'restaurante',
  'comercio',
  'administradora',
  'q2 ingressos',
];

function stripMarks(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function cleanEconomicDescription(value) {
  return String(value || '')
    .trim()
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{12,}\b/gi, ' ')
    .replace(/^(compra no (debito|credito|debito virtual|credito virtual)|compra|pagamento (de )?fatura|pagamento boleto)\s*[-:]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeEconomicDescription(value) {
  return stripMarks(cleanEconomicDescription(value))
    .toLowerCase()
    .replace(/\b\d{2,}\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLoose(value) {
  return stripMarks(String(value || ''))
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function clampConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (String(value || '').trim()) {
      return String(value).trim();
    }
  }
  return '';
}

function simplifyEntity(value) {
  return String(value || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+-\s+agencia:.*$/i, ' ')
    .replace(/\s+-\s+agência:.*$/i, ' ')
    .replace(/\s+agencia:.*$/i, ' ')
    .replace(/\s+agência:.*$/i, ' ')
    .replace(/\s+conta:.*$/i, ' ')
    .replace(/\s+-\s+[0-9*.\u2022/-]+.*$/g, ' ')
    .replace(/\s+-\s+[A-Z]{2,} .*$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractCounterparty(description) {
  const ascii = stripMarks(String(description || '').replace(/\s+/g, ' ').trim());
  const lower = ascii.toLowerCase();
  const prefixes = [
    'transferencia recebida pelo pix - ',
    'transferencia recebida - ',
    'transferencia enviada pelo pix - ',
    'pagamento de boleto efetuado - ',
    'compra no debito via nupay - ',
    'compra no debito - ',
    'estorno - compra no debito via nupay - ',
    'estorno - compra no debito - ',
  ];

  for (const prefix of prefixes) {
    if (!lower.startsWith(prefix)) continue;
    return simplifyEntity(ascii.slice(prefix.length).split(' - ')[0]);
  }

  return simplifyEntity(cleanEconomicDescription(ascii));
}

function looksLikePerson(value) {
  const normalized = normalizeLoose(value);
  if (!normalized || /\d/.test(normalized)) return false;
  if (OWN_NAME_MARKERS.some((marker) => normalized.includes(marker))) return true;
  if (CORPORATE_MARKERS.some((marker) => normalized.includes(marker))) return false;
  const words = normalized.split(' ').filter(Boolean);
  return words.length >= 2 && words.length <= 5;
}

function inferStatementType(row) {
  if (row.statement_type) return row.statement_type;
  if (row.payment_method === 'credit') return 'credit_card';
  return 'legacy';
}

function defaultCategoryForType(economicType, currentCategory = '') {
  if (currentCategory && currentCategory !== 'Transfer') return currentCategory;
  return ECONOMIC_META[economicType]?.category || 'Other';
}

function inferSpendCategory(row, description, normalizedDescription) {
  const suggestion = inferCategoryHint({
    description,
    cleanedDescription: row.cleaned_description || cleanEconomicDescription(description),
    normalizedDescription,
    currentCategory: row.category,
  });

  return suggestion?.category || '';
}

function buildEconomicRuleMap() {
  const map = new Map();
  for (const rule of all('SELECT * FROM economic_rules')) {
    map.set(`${rule.transaction_type}:${rule.statement_type}:${rule.normalized_description}`, rule);
    if (!rule.statement_type) {
      map.set(`${rule.transaction_type}::${rule.normalized_description}`, rule);
    }
  }
  return map;
}

function createClassification({
  economicType,
  confidence,
  source,
  reason,
  needsReview,
  category,
  counterparty,
  merchant,
}) {
  const meta = ECONOMIC_META[economicType] || ECONOMIC_META.unknown;
  return {
    economic_type: economicType,
    reporting_bucket: meta.bucket,
    confidence: clampConfidence(confidence),
    source,
    reason,
    needs_review: needsReview ? 1 : 0,
    category: defaultCategoryForType(economicType, category),
    counterparty: counterparty || '',
    merchant: merchant || '',
  };
}

function classifyWithRule(row, rule, counterparty, merchant) {
  return createClassification({
    economicType: rule.economic_type,
    confidence: 100,
    source: 'rule',
    reason: `Matched your saved economic rule for "${rule.sample_description}".`,
    needsReview: false,
    category: rule.category || row.category,
    counterparty: firstNonEmpty(counterparty, rule.counterparty),
    merchant,
  });
}

export function classifyEconomicMovement(row, ruleMap = buildEconomicRuleMap()) {
  const description = firstNonEmpty(row.description, row.source, 'Imported movement');
  const normalizedDescription = normalizeEconomicDescription(description);
  const statementType = inferStatementType(row);
  const counterparty = extractCounterparty(description);
  const merchant = row.type === 'expense'
    ? firstNonEmpty(counterparty, cleanEconomicDescription(description), description)
    : '';
  const transactionType = row.type === 'income' ? 'income' : 'expense';
  const direction = transactionType === 'income' ? 'in' : 'out';
  const normalized = normalizeLoose(description);
  const amount = Number(row.amount) || 0;
  const suggestedSpendCategory = inferSpendCategory(row, description, normalizedDescription);

  const directRule = ruleMap.get(`${transactionType}:${statementType}:${normalizedDescription}`)
    || ruleMap.get(`${transactionType}::${normalizedDescription}`);
  if (directRule) {
    return classifyWithRule(row, directRule, counterparty, merchant);
  }

  const isOwnMovement = OWN_NAME_MARKERS.some((marker) => normalized.includes(marker));
  const isPixIncoming = normalized.includes('transferencia recebida pelo pix') || normalized.includes('transferencia recebida - ');
  const isPixOutgoing = normalized.includes('transferencia enviada pelo pix');
  const isCardPayment = normalized.includes('pagamento de fatura') || normalized.includes('pagamento recebido');
  const isInvestmentApply = normalized.includes('aplicacao rdb');
  const isInvestmentRedeem = normalized.includes('resgate rdb');
  const isRefund = normalized.includes('estorno');
  const isDebitPurchase = normalized.includes('compra no debito') || normalized.includes('compra no debito via nupay');
  const isPagBankFlow = normalized.includes('pagseguro') || normalized.includes('pagbank');
  const isKnownInvestment = row.category === 'Investments' || suggestedSpendCategory === 'Investments' || isPagBankFlow;

  if (isCardPayment) {
    return createClassification({
      economicType: 'card_payment',
      confidence: 100,
      source: 'heuristic',
      reason: 'Credit card bill settlement detected.',
      needsReview: false,
      category: 'Transfer',
      counterparty,
      merchant,
    });
  }

  if (isInvestmentApply) {
    return createClassification({
      economicType: 'investment_contribution',
      confidence: 100,
      source: 'heuristic',
      reason: 'RDB application detected.',
      needsReview: false,
      category: 'Investments',
      counterparty,
      merchant,
    });
  }

  if (isInvestmentRedeem) {
    return createClassification({
      economicType: 'investment_redemption',
      confidence: 100,
      source: 'heuristic',
      reason: 'RDB redemption detected.',
      needsReview: false,
      category: 'Investments',
      counterparty,
      merchant,
    });
  }

  if (isRefund) {
    return createClassification({
      economicType: 'refund',
      confidence: 100,
      source: 'heuristic',
      reason: 'Refund or reversal detected.',
      needsReview: false,
      category: suggestedSpendCategory || row.category,
      counterparty,
      merchant,
    });
  }

  if (row.is_transfer || row.category === 'Transfer') {
    return createClassification({
      economicType: direction === 'in' ? 'internal_transfer_in' : 'internal_transfer_out',
      confidence: 100,
      source: 'heuristic',
      reason: 'Existing transfer flag from the legacy model was reused.',
      needsReview: false,
      category: 'Transfer',
      counterparty,
      merchant,
    });
  }

  if (isOwnMovement && direction === 'in') {
    return createClassification({
      economicType: 'internal_transfer_in',
      confidence: 100,
      source: 'heuristic',
      reason: 'Incoming movement from your own name detected.',
      needsReview: false,
      category: 'Transfer',
      counterparty,
      merchant,
    });
  }

  if (isOwnMovement && direction === 'out' && isPagBankFlow) {
    return createClassification({
      economicType: 'investment_contribution',
      confidence: 88,
      source: 'heuristic',
      reason: 'Outgoing transfer to one of your own investment destinations looks like capital allocation, not spend.',
      needsReview: true,
      category: 'Investments',
      counterparty,
      merchant,
    });
  }

  if (isOwnMovement && direction === 'out') {
    return createClassification({
      economicType: 'internal_transfer_out',
      confidence: 98,
      source: 'heuristic',
      reason: 'Outgoing movement to your own name detected.',
      needsReview: false,
      category: 'Transfer',
      counterparty,
      merchant,
    });
  }

  if (isKnownInvestment && direction === 'out') {
    return createClassification({
      economicType: 'investment_contribution',
      confidence: isPagBankFlow ? 82 : 92,
      source: 'heuristic',
      reason: isPagBankFlow
        ? 'This destination looks like an investment wallet or broker transfer.'
        : 'Existing Investments category suggests capital allocation.',
      needsReview: isPagBankFlow,
      category: 'Investments',
      counterparty,
      merchant,
    });
  }

  if (transactionType === 'income') {
    if (isPixIncoming && looksLikePerson(counterparty) && amount <= 600) {
      return createClassification({
        economicType: 'reimbursement_in',
        confidence: 72,
        source: 'heuristic',
        reason: 'Incoming Pix from a person and a relatively small amount looks like a reimbursement or shared-cost payback.',
        needsReview: true,
        category: suggestedSpendCategory || row.category,
        counterparty,
        merchant,
      });
    }

    if (normalized.includes('credito em conta')) {
      return createClassification({
        economicType: 'external_income',
        confidence: 55,
        source: 'heuristic',
        reason: 'Generic account credit detected, but the source is still ambiguous.',
        needsReview: true,
        category: suggestedSpendCategory || row.category,
        counterparty,
        merchant,
      });
    }

    return createClassification({
      economicType: 'external_income',
      confidence: looksLikePerson(counterparty) ? 68 : 86,
      source: 'heuristic',
      reason: looksLikePerson(counterparty)
        ? 'Incoming movement looks real, but because it came from a person it could also be a reimbursement.'
        : 'Incoming movement treated as real income.',
      needsReview: looksLikePerson(counterparty),
      category: suggestedSpendCategory || row.category,
      counterparty,
      merchant,
    });
  }

  if (isPixOutgoing && looksLikePerson(counterparty) && amount <= 600) {
    return createClassification({
      economicType: 'consumption_expense',
      confidence: 58,
      source: 'heuristic',
      reason: 'Outgoing Pix to a person may be a shared purchase, repayment or transfer, so it should be reviewed.',
      needsReview: true,
      category: suggestedSpendCategory || row.category,
      counterparty,
      merchant,
    });
  }

  if (isDebitPurchase || statementType === 'credit_card' || ['credit', 'debit', 'cash'].includes(row.payment_method)) {
    return createClassification({
      economicType: 'consumption_expense',
      confidence: 92,
      source: 'heuristic',
      reason: 'Purchase-like movement detected.',
      needsReview: false,
      category: suggestedSpendCategory || row.category,
      counterparty,
      merchant,
    });
  }

  if (normalized.includes('boleto')) {
    return createClassification({
      economicType: 'consumption_expense',
      confidence: 82,
      source: 'heuristic',
      reason: 'Boleto payment treated as a real expense.',
      needsReview: false,
      category: suggestedSpendCategory || row.category,
      counterparty,
      merchant,
    });
  }

  return createClassification({
    economicType: 'unknown',
      confidence: 0,
      source: 'heuristic',
      reason: 'The movement meaning is still unclear and should be reviewed.',
      needsReview: true,
      category: suggestedSpendCategory || row.category,
      counterparty,
      merchant,
    });
}

export function createMovementFingerprint(row) {
  const statementType = inferStatementType(row);
  const externalId = String(row.external_id || '').trim();
  if (externalId) {
    return `${statementType}:${row.type}:${externalId}`;
  }

  return [
    statementType,
    row.type,
    row.date,
    Number(row.amount || 0).toFixed(2),
    normalizeEconomicDescription(row.description),
  ].join(':');
}

export function createImportBatch(rows, sourceFile = '') {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const statementTypes = [...new Set(rows.map((row) => inferStatementType(row)).filter(Boolean))];
  const institutions = [...new Set(rows.map((row) => String(row.institution || '').trim()).filter(Boolean))];
  const dates = rows.map((row) => row.date).filter(Boolean).sort();
  const result = run(
    'INSERT INTO import_batches (source_file, institution, statement_type, row_count, period_start, period_end) VALUES (?, ?, ?, ?, ?, ?)',
    [
      sourceFile || '',
      institutions.length === 1 ? institutions[0] : institutions.join(', '),
      statementTypes.length === 1 ? statementTypes[0] : 'mixed',
      rows.length,
      dates[0] || '',
      dates[dates.length - 1] || '',
    ]
  );

  if (result.lastInsertRowid) {
    return result.lastInsertRowid;
  }

  return get('SELECT MAX(id) as id FROM import_batches')?.id || null;
}

export function upsertEconomicRule(rule) {
  run(`
    INSERT INTO economic_rules (
      normalized_description,
      sample_description,
      transaction_type,
      statement_type,
      economic_type,
      reporting_bucket,
      category,
      counterparty
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(transaction_type, statement_type, normalized_description)
    DO UPDATE SET
      sample_description = excluded.sample_description,
      economic_type = excluded.economic_type,
      reporting_bucket = excluded.reporting_bucket,
      category = excluded.category,
      counterparty = excluded.counterparty,
      updated_at = datetime('now')
  `, [
    rule.normalized_description,
    rule.sample_description,
    rule.transaction_type,
    rule.statement_type || '',
    rule.economic_type,
    rule.reporting_bucket,
    rule.category || '',
    rule.counterparty || '',
  ]);
}

export function upsertEconomicMovement(row, { legacyKind, legacyId = null, batchId = null, sourceFile = '' } = {}) {
  const ruleMap = buildEconomicRuleMap();
  const classification = classifyEconomicMovement(row, ruleMap);
  const fingerprint = createMovementFingerprint(row);
  const statementType = inferStatementType(row);
  const cleanedDescription = cleanEconomicDescription(row.description);
  const normalizedDescription = normalizeEconomicDescription(row.description);

  run(`
    INSERT INTO economic_movements (
      fingerprint,
      legacy_kind,
      legacy_id,
      batch_id,
      statement_type,
      institution,
      source_file,
      external_id,
      date,
      description,
      cleaned_description,
      normalized_description,
      amount,
      transaction_type,
      direction,
      category,
      raw_category,
      payment_method,
      recurrence,
      account_id,
      economic_type,
      reporting_bucket,
      confidence,
      source,
      reason,
      counterparty,
      merchant,
      linked_key,
      needs_review
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(fingerprint)
    DO UPDATE SET
      legacy_kind = excluded.legacy_kind,
      legacy_id = excluded.legacy_id,
      batch_id = excluded.batch_id,
      statement_type = excluded.statement_type,
      institution = excluded.institution,
      source_file = excluded.source_file,
      external_id = excluded.external_id,
      date = excluded.date,
      description = excluded.description,
      cleaned_description = excluded.cleaned_description,
      normalized_description = excluded.normalized_description,
      amount = excluded.amount,
      transaction_type = excluded.transaction_type,
      direction = excluded.direction,
      category = excluded.category,
      raw_category = excluded.raw_category,
      payment_method = excluded.payment_method,
      recurrence = excluded.recurrence,
      account_id = excluded.account_id,
      economic_type = excluded.economic_type,
      reporting_bucket = excluded.reporting_bucket,
      confidence = excluded.confidence,
      source = excluded.source,
      reason = excluded.reason,
      counterparty = excluded.counterparty,
      merchant = excluded.merchant,
      linked_key = excluded.linked_key,
      needs_review = excluded.needs_review,
      updated_at = datetime('now')
  `, [
    fingerprint,
    legacyKind || row.type,
    legacyId,
    batchId,
    statementType,
    row.institution || '',
    sourceFile || row.source_file || '',
    row.external_id || '',
    row.date,
    row.description,
    cleanedDescription,
    normalizedDescription,
    row.amount,
    row.type,
    row.type === 'income' ? 'in' : 'out',
    classification.category,
    row.raw_category || row.category || '',
    row.payment_method || 'other',
    row.recurrence || 'one-time',
    row.account_id || null,
    classification.economic_type,
    classification.reporting_bucket,
    classification.confidence,
    classification.source,
    classification.reason,
    classification.counterparty,
    classification.merchant,
    row.match_key || normalizedDescription,
    classification.needs_review,
  ]);

  return get('SELECT * FROM economic_movements WHERE fingerprint = ?', [fingerprint]);
}

export function ensureEconomicMovementsBackfilled() {
  const missingExpenses = all(`
    SELECT *
    FROM expenses
    WHERE id NOT IN (
      SELECT legacy_id
      FROM economic_movements
      WHERE legacy_kind = 'expense' AND legacy_id IS NOT NULL
    )
    ORDER BY date ASC, id ASC
  `);

  for (const expense of missingExpenses) {
    upsertEconomicMovement(
      {
        type: 'expense',
        date: expense.date,
        description: expense.description,
        amount: expense.amount,
        category: expense.category,
        payment_method: expense.payment_method,
        recurrence: 'one-time',
        account_id: expense.account_id,
        is_transfer: expense.is_transfer,
        statement_type: expense.payment_method === 'credit' ? 'credit_card' : 'legacy',
        institution: 'Legacy data',
        external_id: '',
        raw_category: expense.category,
        source_file: '',
      },
      { legacyKind: 'expense', legacyId: expense.id }
    );
  }

  const missingIncome = all(`
    SELECT *
    FROM income
    WHERE id NOT IN (
      SELECT legacy_id
      FROM economic_movements
      WHERE legacy_kind = 'income' AND legacy_id IS NOT NULL
    )
    ORDER BY date ASC, id ASC
  `);

  for (const income of missingIncome) {
    upsertEconomicMovement(
      {
        type: 'income',
        date: income.date,
        description: income.source,
        amount: income.amount,
        category: '',
        payment_method: 'other',
        recurrence: income.recurrence,
        account_id: income.account_id,
        is_transfer: income.is_transfer,
        statement_type: 'legacy',
        institution: 'Legacy data',
        external_id: '',
        raw_category: '',
        source_file: '',
      },
      { legacyKind: 'income', legacyId: income.id }
    );
  }
}

function backfillHeuristicSpendCategories() {
  const candidates = all(`
    SELECT id, legacy_kind, legacy_id, description, cleaned_description, normalized_description, category
    FROM economic_movements
    WHERE reporting_bucket = 'spend'
      AND (category IS NULL OR category = '' OR category = 'Other')
  `);

  let updated = 0;
  for (const row of candidates) {
    const suggestion = inferCategoryHint({
      description: row.description,
      cleanedDescription: row.cleaned_description,
      normalizedDescription: row.normalized_description,
      currentCategory: row.category,
    });

    if (!suggestion || suggestion.confidence < 90 || suggestion.category === 'Other') {
      continue;
    }

    run(
      'UPDATE economic_movements SET category = ?, updated_at = datetime(\'now\') WHERE id = ? AND (category IS NULL OR category = \'\' OR category = \'Other\')',
      [suggestion.category, row.id]
    );

    if (row.legacy_kind === 'expense' && row.legacy_id) {
      run(
        'UPDATE expenses SET category = ? WHERE id = ? AND (category IS NULL OR category = \'\' OR category = \'Other\')',
        [suggestion.category, row.legacy_id]
      );
    }

    updated += 1;
  }

  return updated;
}

function getAllEconomicMovements() {
  ensureEconomicMovementsBackfilled();
  backfillHeuristicSpendCategories();
  return all('SELECT * FROM economic_movements ORDER BY date DESC, id DESC');
}

function formatMonthLabel(monthKey) {
  if (monthKey === 'all') return 'todo o historico';
  const date = new Date(`${monthKey}-01T12:00:00Z`);
  const formatted = new Intl.DateTimeFormat('pt-BR', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
  return formatted.replace('.', '');
}

function resolveFocusPeriod(rows, month, year) {
  if (month && year) {
    return `${String(year).trim()}-${String(month).trim().padStart(2, '0')}`;
  }

  const months = [...new Set(rows.map((row) => String(row.date || '').slice(0, 7)).filter(Boolean))].sort();
  return months[months.length - 1] || new Date().toISOString().slice(0, 7);
}

const WEEKDAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'];

function getWeekdayIndex(dateString) {
  const date = new Date(`${String(dateString || '').slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return 0;
  return (date.getUTCDay() + 6) % 7;
}

function getWeekOfMonth(dateString) {
  const day = Number(String(dateString || '').slice(8, 10));
  if (!Number.isFinite(day) || day <= 0) return 1;
  return Math.min(5, Math.floor((day - 1) / 7) + 1);
}

function getAvailableMonths(rows) {
  const months = [...new Set(rows.map((row) => String(row.date || '').slice(0, 7)).filter(Boolean))]
    .sort((left, right) => right.localeCompare(left));

  return [
    { value: 'focus', label: 'Mes mais recente' },
    { value: 'all', label: 'Todo o historico' },
    ...months.map((month) => ({ value: month, label: formatMonthLabel(month) })),
  ];
}

function getPeriodRows(rows, period = 'focus', month, year) {
  if (period === 'all') {
    return { focusPeriod: 'all', focusRows: rows };
  }

  const focusPeriod = period && period !== 'focus'
    ? period
    : resolveFocusPeriod(rows, month, year);

  return {
    focusPeriod,
    focusRows: rows.filter((row) => String(row.date || '').startsWith(focusPeriod)),
  };
}

function getPreviousPeriod(months, focusPeriod) {
  if (!focusPeriod || focusPeriod === 'all') return '';
  const ordered = [...months].sort();
  const index = ordered.indexOf(focusPeriod);
  if (index <= 0) return '';
  return ordered[index - 1];
}

function filterRowsForAnalysis(rows, {
  analysisMode = 'spend',
  confidence = 'all',
  statementType = 'all',
  category = 'all',
} = {}) {
  return rows.filter((row) => {
    if (analysisMode === 'spend' && row.reporting_bucket !== 'spend') return false;
    if (analysisMode === 'income' && !['income', 'reimbursement', 'refund'].includes(row.reporting_bucket)) return false;
    if (analysisMode === 'neutral' && !['investment_out', 'investment_in', 'internal_transfer_in', 'internal_transfer_out', 'card_payment'].includes(row.reporting_bucket)) return false;

    if (confidence === 'exact100' && Number(row.confidence || 0) < 100) return false;
    if (confidence === 'under100' && Number(row.confidence || 0) >= 100) return false;

    if (statementType !== 'all' && String(row.statement_type || '') !== statementType) return false;
    if (category !== 'all' && String(row.category || 'Other') !== category) return false;

    return true;
  });
}

function buildFilterOptions(rows) {
  const categories = [...new Set(
    rows
      .map((row) => String(row.category || '').trim())
      .filter((value) => value && value !== 'Transfer')
  )].sort((left, right) => left.localeCompare(right));

  const statementTypes = [...new Set(
    rows
      .map((row) => String(row.statement_type || '').trim())
      .filter(Boolean)
  )].sort((left, right) => left.localeCompare(right));

  return {
    availableMonths: getAvailableMonths(rows),
    analysisModes: [
      { value: 'spend', label: 'Gasto real' },
      { value: 'income', label: 'Entradas e reembolsos' },
      { value: 'neutral', label: 'Movimentos neutros' },
      { value: 'all', label: 'Tudo' },
    ],
    confidenceOptions: [
      { value: 'all', label: 'Qualquer confianca' },
      { value: 'exact100', label: 'So 100%' },
      { value: 'under100', label: 'Abaixo de 100%' },
    ],
    statementTypeOptions: [
      { value: 'all', label: 'Todas as origens' },
      ...statementTypes.map((value) => ({ value, label: value })),
    ],
    categoryOptions: [
      { value: 'all', label: 'Todas as categorias' },
      ...categories.map((value) => ({ value, label: value })),
    ],
  };
}

function buildAnalysisSummary(rows) {
  const total = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const count = rows.length;
  return {
    total,
    count,
    averageTicket: count ? total / count : 0,
    confidence100Share: count ? Math.round((rows.filter((row) => Number(row.confidence || 0) >= 100).length / count) * 100) : 0,
  };
}

function summarizeMovements(rows) {
  const sum = (predicate) => rows.reduce((total, row) => total + (predicate(row) ? Number(row.amount || 0) : 0), 0);
  const count = (predicate) => rows.filter(predicate).length;
  const countCardPayment = (row) => row.reporting_bucket === 'card_payment' && row.statement_type !== 'credit_card';
  const grossIncome = sum((row) => row.reporting_bucket === 'income');
  const grossSpend = sum((row) => row.reporting_bucket === 'spend');
  const reimbursements = sum((row) => row.reporting_bucket === 'reimbursement');
  const refunds = sum((row) => row.reporting_bucket === 'refund');
  const investmentOut = sum((row) => row.reporting_bucket === 'investment_out');
  const investmentIn = sum((row) => row.reporting_bucket === 'investment_in');
  const internalTransferOut = sum((row) => row.reporting_bucket === 'internal_transfer_out');
  const internalTransferIn = sum((row) => row.reporting_bucket === 'internal_transfer_in');
  const cardPayments = sum(countCardPayment);
  const observedInflows = sum((row) => row.transaction_type === 'income');
  const observedOutflows = sum((row) => row.transaction_type === 'expense');
  const netPersonalSpend = Math.max(grossSpend - reimbursements - refunds, 0);

  return {
    movementCount: rows.length,
    reviewCount: count((row) => Number(row.needs_review) === 1),
    grossIncome,
    grossSpend,
    reimbursements,
    refunds,
    netPersonalSpend,
    economicResult: grossIncome - netPersonalSpend,
    investmentOut,
    investmentIn,
    internalTransferOut,
    internalTransferIn,
    cardPayments,
    observedInflows,
    observedOutflows,
  };
}

function buildMonthlySeries(rows) {
  const grouped = new Map();

  for (const row of rows) {
    const monthKey = String(row.date || '').slice(0, 7);
    if (!monthKey) continue;
    const bucket = grouped.get(monthKey) || [];
    bucket.push(row);
    grouped.set(monthKey, bucket);
  }

  return [...grouped.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([month, bucket]) => {
      const summary = summarizeMovements(bucket);
      return {
        month,
        label: formatMonthLabel(month),
        grossIncome: summary.grossIncome,
        grossSpend: summary.grossSpend,
        reimbursements: summary.reimbursements,
        refunds: summary.refunds,
        netPersonalSpend: summary.netPersonalSpend,
        economicResult: summary.economicResult,
        investmentOut: summary.investmentOut,
        investmentIn: summary.investmentIn,
        internalTransferOut: summary.internalTransferOut,
        internalTransferIn: summary.internalTransferIn,
        cardPayments: summary.cardPayments,
        reviewCount: summary.reviewCount,
      };
    });
}

function buildCategorySpend(rows) {
  const totals = new Map();
  for (const row of rows) {
    if (row.reporting_bucket !== 'spend') continue;
    const key = row.category || 'Other';
    totals.set(key, (totals.get(key) || 0) + Number(row.amount || 0));
  }

  return [...totals.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((left, right) => right.total - left.total);
}

function buildOtherSpendDiagnostics(rows) {
  const totals = new Map();

  for (const row of rows) {
    if (row.reporting_bucket !== 'spend' || (row.category || 'Other') !== 'Other') continue;
    const key = firstNonEmpty(row.merchant, row.cleaned_description, row.description);
    const current = totals.get(key) || { name: key, total: 0, count: 0 };
    current.total += Number(row.amount || 0);
    current.count += 1;
    totals.set(key, current);
  }

  return [...totals.values()]
    .sort((left, right) => right.total - left.total)
    .slice(0, 10);
}

function buildBucketBreakdown(rows) {
  const totals = new Map();
  for (const row of rows) {
    if (row.reporting_bucket === 'card_payment' && row.statement_type === 'credit_card') {
      continue;
    }
    const label = ECONOMIC_META[row.economic_type]?.label || row.reporting_bucket;
    totals.set(label, (totals.get(label) || 0) + Number(row.amount || 0));
  }

  return [...totals.entries()]
    .map(([label, total]) => ({ label, total }))
    .sort((left, right) => right.total - left.total);
}

function buildMerchantHighlights(rows) {
  const totals = new Map();

  for (const row of rows) {
    if (row.reporting_bucket !== 'spend') continue;
    const key = firstNonEmpty(row.merchant, row.counterparty, row.cleaned_description, row.description);
    const current = totals.get(key) || { name: key, total: 0, count: 0 };
    current.total += Number(row.amount || 0);
    current.count += 1;
    totals.set(key, current);
  }

  return [...totals.values()]
    .sort((left, right) => right.total - left.total)
    .slice(0, 10);
}

function buildWeekdayRhythm(rows) {
  const base = WEEKDAY_LABELS.map((label, index) => ({
    weekday: label,
    index,
    total: 0,
    count: 0,
    averageTicket: 0,
  }));

  for (const row of rows) {
    const index = getWeekdayIndex(row.date);
    const bucket = base[index];
    bucket.total += Number(row.amount || 0);
    bucket.count += 1;
  }

  return base.map((item) => ({
    ...item,
    averageTicket: item.count ? item.total / item.count : 0,
  }));
}

function buildWeekOfMonthRhythm(rows) {
  const base = Array.from({ length: 5 }, (_, index) => ({
    week: `Semana ${index + 1}`,
    total: 0,
    count: 0,
    averageTicket: 0,
  }));

  for (const row of rows) {
    const bucket = base[getWeekOfMonth(row.date) - 1];
    bucket.total += Number(row.amount || 0);
    bucket.count += 1;
  }

  return base.map((item) => ({
    ...item,
    averageTicket: item.count ? item.total / item.count : 0,
  }));
}

function buildMonthlyFrequency(rows) {
  const grouped = new Map();

  for (const row of rows) {
    const month = String(row.date || '').slice(0, 7);
    if (!month) continue;
    const current = grouped.get(month) || { month, total: 0, count: 0 };
    current.total += Number(row.amount || 0);
    current.count += 1;
    grouped.set(month, current);
  }

  return [...grouped.values()]
    .sort((left, right) => left.month.localeCompare(right.month))
    .map((item) => ({
      ...item,
      label: formatMonthLabel(item.month),
      averageTicket: item.count ? item.total / item.count : 0,
    }));
}

function buildCategoryFrequency(rows) {
  const grouped = new Map();

  for (const row of rows) {
    const key = row.category || 'Other';
    const current = grouped.get(key) || { category: key, total: 0, count: 0 };
    current.total += Number(row.amount || 0);
    current.count += 1;
    grouped.set(key, current);
  }

  return [...grouped.values()]
    .map((item) => ({
      ...item,
      averageTicket: item.count ? item.total / item.count : 0,
    }))
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return right.total - left.total;
    });
}

function buildMerchantFrequency(rows) {
  const grouped = new Map();

  for (const row of rows) {
    const key = firstNonEmpty(row.merchant, row.counterparty, row.cleaned_description, row.description);
    const current = grouped.get(key) || { name: key, total: 0, count: 0 };
    current.total += Number(row.amount || 0);
    current.count += 1;
    grouped.set(key, current);
  }

  return [...grouped.values()]
    .map((item) => ({
      ...item,
      averageTicket: item.count ? item.total / item.count : 0,
    }))
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return right.total - left.total;
    })
    .slice(0, 12);
}

function buildWeekdayCategoryStack(rows, limit = 4) {
  const topCategories = buildCategorySpend(rows)
    .slice(0, limit)
    .map((item) => item.category);

  const base = WEEKDAY_LABELS.map((label) => ({ weekday: label }));
  for (const item of base) {
    for (const category of topCategories) {
      item[category] = 0;
    }
    item.Outros = 0;
  }

  for (const row of rows) {
    const bucket = base[getWeekdayIndex(row.date)];
    const category = row.category || 'Other';
    const key = topCategories.includes(category) ? category : 'Outros';
    bucket[key] += Number(row.amount || 0);
  }

  return {
    categories: [...topCategories, 'Outros'],
    rows: base,
  };
}

function getWeekStart(dateString) {
  const date = new Date(`${String(dateString || '').slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  const weekdayIndex = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekdayIndex);
  return date.toISOString().slice(0, 10);
}

function formatShortDateLabel(dateString) {
  if (!dateString) return '';
  const date = new Date(`${dateString}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  }).format(date).replace('.', '');
}

function formatWeekRangeLabel(weekStart) {
  if (!weekStart) return 'Semana';
  const start = new Date(`${weekStart}T12:00:00Z`);
  if (Number.isNaN(start.getTime())) return 'Semana';
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);

  const startDay = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    timeZone: 'UTC',
  }).format(start);
  const endLabel = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  }).format(end).replace('.', '');

  return `${startDay}-${endLabel}`;
}

function buildWeeklyHeatmap(rows) {
  const grouped = new Map();
  let maxTotal = 0;
  let maxCount = 0;

  for (const row of rows) {
    const weekStart = getWeekStart(row.date);
    if (!weekStart) continue;

    const bucket = grouped.get(weekStart) || {
      weekStart,
      weekLabel: formatWeekRangeLabel(weekStart),
      total: 0,
      count: 0,
      days: WEEKDAY_LABELS.map((weekday, index) => ({
        weekday,
        index,
        total: 0,
        count: 0,
        averageTicket: 0,
        amountIntensity: 0,
        countIntensity: 0,
      })),
    };

    const amount = Number(row.amount || 0);
    const day = bucket.days[getWeekdayIndex(row.date)];
    day.total += amount;
    day.count += 1;
    bucket.total += amount;
    bucket.count += 1;

    maxTotal = Math.max(maxTotal, day.total);
    maxCount = Math.max(maxCount, day.count);
    grouped.set(weekStart, bucket);
  }

  return {
    weekdays: WEEKDAY_LABELS,
    maxTotal,
    maxCount,
    rows: [...grouped.values()]
      .sort((left, right) => left.weekStart.localeCompare(right.weekStart))
      .map((week) => ({
        ...week,
        averageTicket: week.count ? week.total / week.count : 0,
        days: week.days.map((day) => ({
          ...day,
          averageTicket: day.count ? day.total / day.count : 0,
          amountIntensity: maxTotal ? Math.round((day.total / maxTotal) * 100) : 0,
          countIntensity: maxCount ? Math.round((day.count / maxCount) * 100) : 0,
        })),
      })),
  };
}

function buildWeeklyTrend(rows) {
  const grouped = new Map();

  for (const row of rows) {
    const weekStart = getWeekStart(row.date);
    if (!weekStart) continue;

    const bucket = grouped.get(weekStart) || {
      weekStart,
      weekLabel: formatWeekRangeLabel(weekStart),
      total: 0,
      count: 0,
      categories: new Map(),
      merchants: new Map(),
    };

    const amount = Number(row.amount || 0);
    bucket.total += amount;
    bucket.count += 1;

    const category = row.category || 'Other';
    bucket.categories.set(category, (bucket.categories.get(category) || 0) + amount);

    const merchant = firstNonEmpty(row.merchant, row.counterparty, row.cleaned_description, row.description);
    bucket.merchants.set(merchant, (bucket.merchants.get(merchant) || 0) + amount);

    grouped.set(weekStart, bucket);
  }

  const ordered = [...grouped.values()]
    .sort((left, right) => left.weekStart.localeCompare(right.weekStart))
    .map((bucket) => {
      const topCategory = [...bucket.categories.entries()]
        .map(([category, total]) => ({ category, total }))
        .sort((left, right) => right.total - left.total)[0] || null;
      const topMerchant = [...bucket.merchants.entries()]
        .map(([name, total]) => ({ name, total }))
        .sort((left, right) => right.total - left.total)[0] || null;

      return {
        weekStart: bucket.weekStart,
        weekLabel: bucket.weekLabel,
        total: bucket.total,
        count: bucket.count,
        averageTicket: bucket.count ? bucket.total / bucket.count : 0,
        topCategory,
        topMerchant,
      };
    });

  return ordered.map((week, index) => {
    const previous = ordered[index - 1];
    const deltaTotal = previous ? week.total - previous.total : 0;
    const deltaCount = previous ? week.count - previous.count : 0;
    return {
      ...week,
      deltaTotal,
      deltaCount,
      changePct: previous && previous.total
        ? Math.round((deltaTotal / previous.total) * 100)
        : null,
    };
  });
}

function buildWeekOverWeekSummary(weeklyTrend) {
  if (weeklyTrend.length < 2) {
    return null;
  }

  const current = weeklyTrend[weeklyTrend.length - 1];
  const previous = weeklyTrend[weeklyTrend.length - 2];
  const biggestSwings = weeklyTrend
    .slice(1)
    .map((week) => ({
      ...week,
      absDelta: Math.abs(week.deltaTotal),
    }))
    .sort((left, right) => right.absDelta - left.absDelta)
    .slice(0, 5);

  return {
    currentWeek: current,
    previousWeek: previous,
    deltaTotal: current.total - previous.total,
    deltaCount: current.count - previous.count,
    changePct: previous.total ? Math.round(((current.total - previous.total) / previous.total) * 100) : null,
    biggestSwings,
  };
}

function buildMerchantBehavior(rows) {
  const grouped = new Map();
  const overallAverageTicket = rows.length
    ? rows.reduce((sum, row) => sum + Number(row.amount || 0), 0) / rows.length
    : 0;

  for (const row of rows) {
    const name = firstNonEmpty(row.merchant, row.counterparty, row.cleaned_description, row.description);
    const bucket = grouped.get(name) || {
      name,
      total: 0,
      count: 0,
      weeks: new Set(),
      months: new Set(),
      weekdayIndexes: new Set(),
      tickets: [],
      categoryTotals: new Map(),
    };

    const amount = Number(row.amount || 0);
    bucket.total += amount;
    bucket.count += 1;
    bucket.weeks.add(getWeekStart(row.date));
    bucket.months.add(String(row.date || '').slice(0, 7));
    bucket.weekdayIndexes.add(getWeekdayIndex(row.date));
    bucket.tickets.push(amount);
    const category = row.category || 'Other';
    bucket.categoryTotals.set(category, (bucket.categoryTotals.get(category) || 0) + amount);
    grouped.set(name, bucket);
  }

  const merchants = [...grouped.values()].map((bucket) => {
    const averageTicket = bucket.count ? bucket.total / bucket.count : 0;
    const maxTicket = Math.max(...bucket.tickets, 0);
    const minTicket = Math.min(...bucket.tickets);
    const primaryCategory = [...bucket.categoryTotals.entries()]
      .map(([category, total]) => ({ category, total }))
      .sort((left, right) => right.total - left.total)[0] || null;

    return {
      name: bucket.name,
      total: bucket.total,
      count: bucket.count,
      averageTicket,
      maxTicket,
      minTicket,
      weeksActive: bucket.weeks.size,
      monthsActive: bucket.months.size,
      weekdaysActive: bucket.weekdayIndexes.size,
      primaryCategory: primaryCategory?.category || 'Other',
      spreadScore: averageTicket ? Math.round(((maxTicket - minTicket) / averageTicket) * 100) : 0,
    };
  });

  const recurring = merchants
    .filter((merchant) => merchant.count >= 3 && merchant.weeksActive >= 2)
    .sort((left, right) => {
      if (right.weeksActive !== left.weeksActive) return right.weeksActive - left.weeksActive;
      if (right.count !== left.count) return right.count - left.count;
      return right.total - left.total;
    })
    .slice(0, 8);

  const impulsive = merchants
    .filter((merchant) => {
      const threshold = Math.max(overallAverageTicket * 1.8, 120);
      return merchant.averageTicket >= threshold && merchant.weeksActive <= 1 && merchant.count <= 2;
    })
    .sort((left, right) => {
      if (right.averageTicket !== left.averageTicket) return right.averageTicket - left.averageTicket;
      return right.total - left.total;
    })
    .slice(0, 8);

  return {
    overallAverageTicket,
    recurring,
    impulsive,
    summary: {
      recurringCount: recurring.length,
      impulsiveCount: impulsive.length,
    },
  };
}

function buildPeriodComparison(rows, focusPeriod) {
  if (!focusPeriod || focusPeriod === 'all') {
    return null;
  }

  const months = [...new Set(rows.map((row) => String(row.date || '').slice(0, 7)).filter(Boolean))];
  const previousPeriod = getPreviousPeriod(months, focusPeriod);
  if (!previousPeriod) {
    return null;
  }

  const currentRows = rows.filter((row) => String(row.date || '').startsWith(focusPeriod));
  const previousRows = rows.filter((row) => String(row.date || '').startsWith(previousPeriod));
  const currentSummary = summarizeMovements(currentRows);
  const previousSummary = summarizeMovements(previousRows);
  const currentSpendByCategory = new Map(buildCategorySpend(currentRows).map((item) => [item.category, item.total]));
  const previousSpendByCategory = new Map(buildCategorySpend(previousRows).map((item) => [item.category, item.total]));
  const allCategories = [...new Set([...currentSpendByCategory.keys(), ...previousSpendByCategory.keys()])];

  const categoryDelta = allCategories
    .map((category) => {
      const currentTotal = currentSpendByCategory.get(category) || 0;
      const previousTotal = previousSpendByCategory.get(category) || 0;
      return {
        category,
        currentTotal,
        previousTotal,
        delta: currentTotal - previousTotal,
      };
    })
    .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))
    .slice(0, 6);

  return {
    currentPeriod: focusPeriod,
    currentLabel: formatMonthLabel(focusPeriod),
    previousPeriod,
    previousLabel: formatMonthLabel(previousPeriod),
    economicResultDelta: currentSummary.economicResult - previousSummary.economicResult,
    netSpendDelta: currentSummary.netPersonalSpend - previousSummary.netPersonalSpend,
    grossIncomeDelta: currentSummary.grossIncome - previousSummary.grossIncome,
    categoryDelta,
  };
}

function buildInsights(rows, analysisRows, focusPeriod, comparison) {
  const weekdayRhythm = buildWeekdayRhythm(analysisRows);
  const categorySpend = buildCategorySpend(analysisRows);
  const merchantFrequency = buildMerchantFrequency(analysisRows);
  const weeklyTrend = buildWeeklyTrend(analysisRows);
  const weekOverWeek = buildWeekOverWeekSummary(weeklyTrend);
  const merchantBehavior = buildMerchantBehavior(analysisRows);
  const busiestWeekday = [...weekdayRhythm].sort((left, right) => right.count - left.count)[0] || null;
  const spendiestWeekday = [...weekdayRhythm].sort((left, right) => right.total - left.total)[0] || null;
  const topCategory = categorySpend[0] || null;
  const topMerchant = merchantFrequency[0] || null;
  const weekendTotal = analysisRows
    .filter((row) => {
      const index = getWeekdayIndex(row.date);
      return index >= 5;
    })
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const total = analysisRows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const averageWeekly = focusPeriod && focusPeriod !== 'all'
    ? total / Math.max(new Set(analysisRows.map((row) => getWeekOfMonth(row.date))).size, 1)
    : total / Math.max(new Set(analysisRows.map((row) => String(row.date || '').slice(0, 7))).size, 1);

  return {
    busiestWeekday,
    spendiestWeekday,
    topCategory: topCategory
      ? {
          ...topCategory,
          sharePct: total ? Math.round((topCategory.total / total) * 100) : 0,
        }
      : null,
    topMerchant,
    weekendSharePct: total ? Math.round((weekendTotal / total) * 100) : 0,
    averageWeekly,
    averageTicket: analysisRows.length ? total / analysisRows.length : 0,
    weekOverWeek,
    routineMerchant: merchantBehavior.recurring[0] || null,
    impulsiveMerchant: merchantBehavior.impulsive[0] || null,
    comparison,
  };
}

function buildImportantMovements(rows) {
  return rows
    .filter((row) => {
      if (row.reporting_bucket === 'card_payment' && row.statement_type === 'credit_card') {
        return false;
      }
      return Number(row.needs_review) === 1 || ['investment_out', 'reimbursement', 'card_payment', 'refund'].includes(row.reporting_bucket);
    })
    .sort((left, right) => {
      if (Number(left.needs_review) !== Number(right.needs_review)) {
        return Number(right.needs_review) - Number(left.needs_review);
      }
      return String(right.date).localeCompare(String(left.date));
    })
    .slice(0, 10);
}

export function getWorkspaceOverview({ month, year } = {}) {
  const rows = getAllEconomicMovements();
  const focusPeriod = resolveFocusPeriod(rows, month, year);
  const focusRows = rows.filter((row) => String(row.date || '').startsWith(focusPeriod));
  const trackedMonths = [...new Set(rows.map((row) => String(row.date || '').slice(0, 7)).filter(Boolean))].length;

  return {
    focusPeriod,
    focusLabel: formatMonthLabel(focusPeriod),
    trackedMonths,
    summary: summarizeMovements(focusRows),
    allTimeSummary: summarizeMovements(rows),
    spendByCategory: buildCategorySpend(focusRows).slice(0, 8),
    otherSpendDiagnostics: buildOtherSpendDiagnostics(focusRows),
    monthlySeries: buildMonthlySeries(rows).slice(-12),
    importantMovements: buildImportantMovements(focusRows),
    recentBatches: all('SELECT * FROM import_batches ORDER BY created_at DESC, id DESC LIMIT 8'),
  };
}

export function getWorkspaceReports({
  month,
  year,
  period = 'focus',
  analysisMode = 'spend',
  confidence = 'all',
  statementType = 'all',
  category = 'all',
} = {}) {
  const rows = getAllEconomicMovements();
  const { focusPeriod, focusRows } = getPeriodRows(rows, period, month, year);
  const analysisRows = filterRowsForAnalysis(focusRows, {
    analysisMode,
    confidence,
    statementType,
    category,
  });
  const comparison = buildPeriodComparison(rows, focusPeriod);
  const categoryFrequency = buildCategoryFrequency(analysisRows);
  const merchantFrequency = buildMerchantFrequency(analysisRows);
  const weekdayRhythm = buildWeekdayRhythm(analysisRows);
  const weekOfMonthRhythm = buildWeekOfMonthRhythm(analysisRows);
  const weekdayCategoryStack = buildWeekdayCategoryStack(analysisRows);
  const weeklyHeatmap = buildWeeklyHeatmap(analysisRows);
  const weeklyTrend = buildWeeklyTrend(analysisRows);
  const weekOverWeek = buildWeekOverWeekSummary(weeklyTrend);
  const merchantBehavior = buildMerchantBehavior(analysisRows);

  return {
    focusPeriod,
    focusLabel: formatMonthLabel(focusPeriod),
    summary: summarizeMovements(focusRows),
    analysisSummary: buildAnalysisSummary(analysisRows),
    activeFilters: {
      period: focusPeriod,
      analysisMode,
      confidence,
      statementType,
      category,
    },
    filters: buildFilterOptions(rows),
    monthlySeries: buildMonthlySeries(
      filterRowsForAnalysis(rows, {
        analysisMode,
        confidence,
        statementType,
        category,
      })
    ),
    monthlyFrequency: buildMonthlyFrequency(analysisRows.length ? analysisRows : focusRows),
    categorySpend: buildCategorySpend(analysisRows),
    categoryFrequency,
    otherSpendDiagnostics: buildOtherSpendDiagnostics(analysisRows),
    bucketBreakdown: buildBucketBreakdown(focusRows),
    merchantHighlights: buildMerchantHighlights(analysisRows),
    merchantFrequency,
    weekdayRhythm,
    weekOfMonthRhythm,
    weekdayCategoryStack,
    weeklyHeatmap,
    weeklyTrend,
    weekOverWeek,
    merchantBehavior,
    insights: buildInsights(rows, analysisRows, focusPeriod, comparison),
    recentBatches: all('SELECT * FROM import_batches ORDER BY created_at DESC, id DESC LIMIT 12'),
  };
}

function buildAuditConfidenceGroups(rows) {
  const totals = new Map();

  for (const row of rows) {
    if (Number(row.confidence) >= 100) continue;
    const name = firstNonEmpty(row.merchant, row.counterparty, row.cleaned_description, row.description);
    const current = totals.get(name) || {
      name,
      total: 0,
      count: 0,
      minConfidence: 100,
      maxConfidence: 0,
      latestDate: '',
      categories: new Set(),
    };
    current.total += Number(row.amount || 0);
    current.count += 1;
    current.minConfidence = Math.min(current.minConfidence, Number(row.confidence || 0));
    current.maxConfidence = Math.max(current.maxConfidence, Number(row.confidence || 0));
    current.latestDate = String(current.latestDate || '') > String(row.date || '') ? current.latestDate : row.date;
    if (row.category) current.categories.add(row.category);
    totals.set(name, current);
  }

  return [...totals.values()]
    .map((item) => ({
      ...item,
      categories: [...item.categories].slice(0, 3),
    }))
    .sort((left, right) => {
      if (left.minConfidence !== right.minConfidence) return left.minConfidence - right.minConfidence;
      return right.total - left.total;
    })
    .slice(0, 20);
}

export function getWorkspaceAudit({ filter = 'all' } = {}) {
  const rows = getAllEconomicMovements();
  const normalizedFilter = ['all', 'under100', 'exact100'].includes(filter) ? filter : 'all';
  const filteredRows = rows.filter((row) => {
    if (normalizedFilter === 'under100') return Number(row.confidence || 0) < 100;
    if (normalizedFilter === 'exact100') return Number(row.confidence || 0) >= 100;
    return true;
  });

  return {
    filter: normalizedFilter,
    summary: {
      totalMovements: rows.length,
      under100Count: rows.filter((row) => Number(row.confidence || 0) < 100).length,
      exact100Count: rows.filter((row) => Number(row.confidence || 0) >= 100).length,
      reviewCount: rows.filter((row) => Number(row.needs_review) === 1).length,
      expenseCount: rows.filter((row) => row.transaction_type === 'expense').length,
      incomeCount: rows.filter((row) => row.transaction_type === 'income').length,
    },
    uncertainProducts: buildAuditConfidenceGroups(
      rows.filter((row) => row.transaction_type === 'expense')
    ),
    items: filteredRows,
    recentBatches: all('SELECT * FROM import_batches ORDER BY created_at DESC, id DESC LIMIT 12'),
  };
}

export function getReviewQueue(limit = 120) {
  const rows = getAllEconomicMovements()
    .filter((row) => Number(row.needs_review) === 1)
    .sort((left, right) => {
      if (left.confidence !== right.confidence) return left.confidence - right.confidence;
      return String(right.date).localeCompare(String(left.date));
    });

  return {
    total: rows.length,
    items: rows.slice(0, limit),
  };
}

export function upsertImportRuleFromMovement(movement) {
  if (!movement.normalized_description) return;

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
    movement.normalized_description,
    movement.description,
    movement.transaction_type,
    movement.category || '',
    movement.payment_method || 'other',
    movement.recurrence || 'one-time',
    movement.category === 'Subscriptions' ? 1 : 0,
    movement.category === 'Subscriptions' ? 'monthly' : 'monthly',
    movement.category === 'Subscriptions' ? movement.description.slice(0, 120) : '',
  ]);
}

function buildMovementTargetIds(movement, applyToMatches = true) {
  if (!applyToMatches) {
    return [movement.id];
  }

  const matches = all(`
    SELECT id
    FROM economic_movements
    WHERE transaction_type = ?
      AND normalized_description = ?
      AND COALESCE(statement_type, '') = COALESCE(?, '')
  `, [
    movement.transaction_type,
    movement.normalized_description,
    movement.statement_type || '',
  ]);

  const matchedIds = [...new Set(matches.map((row) => Number(row.id)).filter(Number.isFinite))];
  return matchedIds.length ? matchedIds : [movement.id];
}

function syncLegacyMovementRow(movement) {
  const transferType = ['internal_transfer_in', 'internal_transfer_out', 'card_payment'].includes(movement.economic_type) ? 1 : 0;

  if (movement.legacy_kind === 'expense' && movement.legacy_id) {
    run(`
      UPDATE expenses
      SET category = ?,
          payment_method = ?,
          is_transfer = ?,
          ignore_dashboard = 0
      WHERE id = ?
    `, [
      movement.category || 'Other',
      movement.payment_method || 'other',
      transferType,
      movement.legacy_id,
    ]);
    return;
  }

  if (movement.legacy_kind === 'income' && movement.legacy_id) {
    run(`
      UPDATE income
      SET recurrence = ?,
          is_transfer = ?,
          ignore_dashboard = 0
      WHERE id = ?
    `, [
      movement.recurrence || 'one-time',
      transferType,
      movement.legacy_id,
    ]);
  }
}

export function updateImportedMovement(id, {
  economicType,
  category = '',
  paymentMethod = '',
  recurrence = '',
  counterparty = '',
  merchant = '',
  applyToMatches = true,
  saveRule = true,
} = {}) {
  const movement = get('SELECT * FROM economic_movements WHERE id = ?', [id]);
  if (!movement) {
    throw new Error('Movement not found');
  }

  const meta = ECONOMIC_META[economicType] || ECONOMIC_META.unknown;
  const targetIds = buildMovementTargetIds(movement, applyToMatches);
  const placeholders = targetIds.map(() => '?').join(', ');
  const nextCategory = defaultCategoryForType(economicType, category || movement.category);
  const nextPaymentMethod = paymentMethod || movement.payment_method || 'other';
  const nextRecurrence = recurrence || movement.recurrence || 'one-time';
  const nextCounterparty = String(counterparty || '').trim() || movement.counterparty || '';
  const nextMerchant = String(merchant || '').trim() || movement.merchant || movement.cleaned_description || movement.description;

  run(`
    UPDATE economic_movements
    SET economic_type = ?,
        reporting_bucket = ?,
        category = ?,
        payment_method = ?,
        recurrence = ?,
        counterparty = ?,
        merchant = ?,
        confidence = 100,
        source = 'manual',
        reason = ?,
        needs_review = 0,
        updated_at = datetime('now')
    WHERE id IN (${placeholders})
  `, [
    economicType,
    meta.bucket,
    nextCategory,
    nextPaymentMethod,
    nextRecurrence,
    nextCounterparty,
    nextMerchant,
    'Edited by you in the audit trail.',
    ...targetIds,
  ]);

  const updatedRows = all(`SELECT * FROM economic_movements WHERE id IN (${placeholders}) ORDER BY date DESC, id DESC`, targetIds);
  for (const row of updatedRows) {
    syncLegacyMovementRow(row);
  }

  const updated = get('SELECT * FROM economic_movements WHERE id = ?', [id]);
  if (saveRule) {
    upsertEconomicRule({
      normalized_description: updated.normalized_description,
      sample_description: updated.description,
      transaction_type: updated.transaction_type,
      statement_type: updated.statement_type,
      economic_type: updated.economic_type,
      reporting_bucket: updated.reporting_bucket,
      category: updated.category,
      counterparty: updated.counterparty,
    });

    if (updated.economic_type === 'consumption_expense' || updated.category === 'Subscriptions') {
      upsertImportRuleFromMovement(updated);
    }
  }

  return {
    item: updated,
    affectedIds: targetIds,
    affectedCount: targetIds.length,
  };
}

export function confirmMovementReview(id, { economicType, category = '', saveRule = true } = {}) {
  const movement = get('SELECT * FROM economic_movements WHERE id = ?', [id]);
  if (!movement) {
    throw new Error('Movement not found');
  }

  const meta = ECONOMIC_META[economicType] || ECONOMIC_META.unknown;
  const nextCategory = defaultCategoryForType(economicType, category || movement.category);
  const targetIds = buildMovementTargetIds(movement, true);
  const placeholders = targetIds.map(() => '?').join(', ');

  run(`
    UPDATE economic_movements
    SET economic_type = ?,
        reporting_bucket = ?,
        category = ?,
        confidence = 100,
        source = 'manual',
        reason = ?,
        needs_review = 0,
        updated_at = datetime('now')
    WHERE id IN (${placeholders})
  `, [
    economicType,
    meta.bucket,
    nextCategory,
    'Confirmed by you in the review queue.',
    ...targetIds,
  ]);

  const updated = get('SELECT * FROM economic_movements WHERE id = ?', [id]);
  if (saveRule) {
    upsertEconomicRule({
      normalized_description: updated.normalized_description,
      sample_description: updated.description,
      transaction_type: updated.transaction_type,
      statement_type: updated.statement_type,
      economic_type: updated.economic_type,
      reporting_bucket: updated.reporting_bucket,
      category: updated.category,
      counterparty: updated.counterparty,
    });

    if (updated.economic_type === 'consumption_expense' || updated.category === 'Subscriptions') {
      upsertImportRuleFromMovement(updated);
    }
  }

  return {
    item: updated,
    affectedIds: targetIds,
    affectedCount: targetIds.length,
  };
}

export function getWorkspaceRules() {
  return {
    importRules: all('SELECT * FROM import_rules ORDER BY updated_at DESC, id DESC'),
    economicRules: all('SELECT * FROM economic_rules ORDER BY updated_at DESC, id DESC'),
  };
}

export function deleteWorkspaceRule(kind, id) {
  if (kind === 'import') {
    return run('DELETE FROM import_rules WHERE id = ?', [id]).changes;
  }
  if (kind === 'economic') {
    return run('DELETE FROM economic_rules WHERE id = ?', [id]).changes;
  }
  return 0;
}

export function buildAiWorkspaceContext() {
  const overview = getWorkspaceOverview();
  const reports = getWorkspaceReports();
  const reviewQueue = getReviewQueue(12);

  return {
    focusPeriod: overview.focusPeriod,
    focusLabel: overview.focusLabel,
    summary: overview.summary,
    allTimeSummary: overview.allTimeSummary,
    spendByCategory: overview.spendByCategory,
    otherSpendDiagnostics: reports.otherSpendDiagnostics.slice(0, 8),
    monthlySeries: reports.monthlySeries.slice(-6),
    merchantHighlights: reports.merchantHighlights.slice(0, 8),
    weekdayRhythm: reports.weekdayRhythm,
    weekOfMonthRhythm: reports.weekOfMonthRhythm,
    weeklyTrend: reports.weeklyTrend.slice(-8),
    weekOverWeek: reports.weekOverWeek,
    merchantBehavior: reports.merchantBehavior,
    categoryFrequency: reports.categoryFrequency.slice(0, 8),
    merchantFrequency: reports.merchantFrequency.slice(0, 8),
    insights: reports.insights,
    bucketBreakdown: reports.bucketBreakdown,
    openReviewItems: reviewQueue.total,
    reviewExamples: reviewQueue.items.slice(0, 8).map((item) => ({
      date: item.date,
      description: item.description,
      amount: item.amount,
      suggestedType: item.economic_type,
      reason: item.reason,
    })),
  };
}
