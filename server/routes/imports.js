import express from 'express';
import { commitImportRows, analyzeImportRows } from '../import-utils.js';
import { handleRouteError, HttpError } from '../http.js';
import {
  CATEGORY_SET,
  CYCLE_SET,
  MAX_IMPORT_ITEMS,
  PAYMENT_METHOD_SET,
  RECURRENCE_SET,
  assertMaxItems,
  ensurePlainObject,
  parseBooleanFlag,
  parseDateString,
  parseEnum,
  parseOptionalId,
  parseOptionalString,
  parsePositiveAmount,
  parseRequiredString,
} from '../validation.js';

const router = express.Router();
const IMPORT_TYPE_SET = new Set(['expense', 'income']);

function parseImportRows(input, { commit = false } = {}) {
  const payload = ensurePlainObject(input);
  const rawRows = assertMaxItems(payload.rows, MAX_IMPORT_ITEMS, 'rows');

  return rawRows.map((rawRow, index) => {
    const row = ensurePlainObject(rawRow, `rows[${index}]`);
    const id = parseRequiredString('id', row.id ?? row._id ?? String(index), { max: 80 });
    const type = parseEnum('type', row.type, IMPORT_TYPE_SET);
    const parsedRow = {
      id,
      type,
      date: parseDateString('date', row.date),
      description: parseRequiredString('description', row.description, { max: 220 }),
      amount: parsePositiveAmount('amount', row.amount, { allowZero: true }),
      category: type === 'expense'
        ? parseEnum('category', row.category, CATEGORY_SET, { defaultValue: 'Other' })
        : '',
      payment_method: type === 'expense'
        ? parseEnum('payment_method', row.payment_method, PAYMENT_METHOD_SET, { defaultValue: 'other' })
        : 'other',
      recurrence: type === 'income'
        ? parseEnum('recurrence', row.recurrence, RECURRENCE_SET, { defaultValue: 'one-time' })
        : 'one-time',
      notes: parseOptionalString(row.notes, { max: 1000 }),
      account_id: parseOptionalId(row.account_id, 'account_id'),
      ignore_dashboard: parseBooleanFlag(row.ignore_dashboard, 'ignore_dashboard'),
      is_subscription: type === 'expense'
        ? parseBooleanFlag(row.is_subscription ?? (row.category === 'Subscriptions'), 'is_subscription')
        : 0,
      subscription_cycle: type === 'expense'
        ? parseEnum('subscription_cycle', row.subscription_cycle, CYCLE_SET, { defaultValue: 'monthly' })
        : 'monthly',
      subscription_name: type === 'expense'
        ? parseOptionalString(row.subscription_name, { max: 120 })
        : '',
      statement_type: parseOptionalString(row.statement_type, { max: 40 }),
      institution: parseOptionalString(row.institution, { max: 80 }),
      external_id: parseOptionalString(row.external_id, { max: 120 }),
      raw_category: parseOptionalString(row.raw_category, { max: 120 }),
      source_file: parseOptionalString(row.source_file ?? payload.fileName, { max: 220 }),
      needs_review: commit ? parseBooleanFlag(row.needs_review, 'needs_review') : 0,
    };

    if (parsedRow.type === 'expense' && parsedRow.category === 'Subscriptions') {
      parsedRow.is_subscription = 1;
      if (!parsedRow.subscription_name) {
        parsedRow.subscription_name = parsedRow.description;
      }
    }

    if (parsedRow.type === 'expense' && commit && parsedRow.needs_review) {
      throw new HttpError(400, 'Review every expense category before importing');
    }

    return parsedRow;
  });
}

router.post('/analyze', async (req, res) => {
  try {
    const rows = parseImportRows(req.body, { commit: false });
    const result = await analyzeImportRows(rows);
    res.json(result);
  } catch (error) {
    handleRouteError(res, error, 'Failed to analyze CSV rows');
  }
});

router.post('/commit', (req, res) => {
  try {
    const rows = parseImportRows(req.body, { commit: true });
    const result = commitImportRows(rows, {
      sourceFile: parseOptionalString(req.body?.fileName, { max: 220 }),
    });
    res.json(result);
  } catch (error) {
    handleRouteError(res, error, 'Failed to import reviewed rows');
  }
});

export default router;
