import express from 'express';
import { all, get, run } from '../db.js';
import { handleRouteError, HttpError } from '../http.js';
import {
  MAX_IMPORT_ITEMS,
  RECURRENCE_SET,
  assertMaxItems,
  ensurePlainObject,
  parseBooleanFlag,
  parseDateString,
  parseEnum,
  parseIdArray,
  parseIdParam,
  parseMonthYearFilters,
  parseOptionalId,
  parseOptionalString,
  parsePositiveAmount,
  parseRequiredString,
} from '../validation.js';

const router = express.Router();

function assertAccountExists(accountId) {
  if (accountId === null) {
    return;
  }

  const account = get('SELECT id FROM accounts WHERE id = ?', [accountId]);
  if (!account) {
    throw new HttpError(400, 'account_id does not reference an existing account');
  }
}

function parseIncomePayload(input) {
  const payload = {
    source: parseRequiredString('source', input?.source, { max: 180 }),
    amount: parsePositiveAmount('amount', input?.amount),
    date: parseDateString('date', input?.date),
    recurrence: parseEnum('recurrence', input?.recurrence, RECURRENCE_SET, { defaultValue: 'one-time' }),
    notes: parseOptionalString(input?.notes, { max: 1000 }),
    account_id: parseOptionalId(input?.account_id, 'account_id'),
    is_transfer: parseBooleanFlag(input?.is_transfer, 'is_transfer'),
    ignore_dashboard: parseBooleanFlag(input?.ignore_dashboard, 'ignore_dashboard'),
  };

  assertAccountExists(payload.account_id);

  if (payload.is_transfer) {
    if (payload.account_id === null) {
      throw new HttpError(400, 'account_id is required for transfers');
    }

    payload.recurrence = 'one-time';
  }

  return payload;
}

router.get('/', (req, res) => {
  try {
    const filters = parseMonthYearFilters(req.query);
    let query = 'SELECT * FROM income';
    const params = [];

    if (filters) {
      query += ` WHERE strftime('%Y', date) = ? AND strftime('%m', date) = ?`;
      params.push(filters.year, filters.month);
    }

    query += ' ORDER BY date DESC';
    res.json(all(query, params));
  } catch (error) {
    handleRouteError(res, error, 'Failed to fetch income');
  }
});

router.post('/', (req, res) => {
  try {
    const income = parseIncomePayload(req.body);
    const result = run(
      'INSERT INTO income (source, amount, date, recurrence, notes, account_id, is_transfer, ignore_dashboard) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        income.source,
        income.amount,
        income.date,
        income.recurrence,
        income.notes,
        income.account_id,
        income.is_transfer,
        income.ignore_dashboard,
      ]
    );

    res.status(201).json({ id: result.lastInsertRowid, ...income });
  } catch (error) {
    handleRouteError(res, error, 'Failed to create income entry');
  }
});

router.post('/import', (req, res) => {
  try {
    const incomes = assertMaxItems(req.body?.incomes, MAX_IMPORT_ITEMS, 'incomes');
    let imported = 0;
    let skipped = 0;
    let invalid = 0;

    for (const rawIncome of incomes) {
      try {
        const income = parseIncomePayload({
          ...rawIncome,
          source: rawIncome?.source || rawIncome?.description,
          recurrence: rawIncome?.recurrence || 'one-time',
        });
        const exists = get(
          'SELECT id FROM income WHERE date=? AND amount=? AND source=?',
          [income.date, income.amount, income.source]
        );

        if (exists) {
          skipped++;
          continue;
        }

        run(
          'INSERT INTO income (source, amount, date, recurrence, notes, account_id, is_transfer, ignore_dashboard) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [
            income.source,
            income.amount,
            income.date,
            income.recurrence,
            income.notes,
            income.account_id,
            income.is_transfer,
            income.ignore_dashboard,
          ]
        );
        imported++;
      } catch (error) {
        invalid++;
      }
    }

    res.json({ imported, skipped, invalid });
  } catch (error) {
    handleRouteError(res, error, 'Failed to import income');
  }
});

router.delete('/bulk', (req, res) => {
  try {
    const ids = parseIdArray(req.body?.ids);
    let deleted = 0;

    for (const id of ids) {
      deleted += run('DELETE FROM income WHERE id=?', [id]).changes;
    }

    res.json({ deleted });
  } catch (error) {
    handleRouteError(res, error, 'Failed to delete income');
  }
});

router.put('/bulk', (req, res) => {
  try {
    const ids = parseIdArray(req.body?.ids);
    const updates = ensurePlainObject(req.body?.updates, 'updates');
    const allowedKeys = ['recurrence', 'account_id', 'ignore_dashboard'];
    const fields = Object.keys(updates).filter((key) => allowedKeys.includes(key));

    if (fields.length === 0) {
      throw new HttpError(400, 'No valid fields to update');
    }

    const normalizedUpdates = {};
    for (const field of fields) {
      if (field === 'recurrence') {
        normalizedUpdates.recurrence = parseEnum('recurrence', updates.recurrence, RECURRENCE_SET);
      }
      if (field === 'account_id') {
        normalizedUpdates.account_id = parseOptionalId(updates.account_id, 'account_id');
        assertAccountExists(normalizedUpdates.account_id);
      }
      if (field === 'ignore_dashboard') {
        normalizedUpdates.ignore_dashboard = parseBooleanFlag(updates.ignore_dashboard, 'ignore_dashboard');
      }
    }

    const updateFields = Object.keys(normalizedUpdates);
    const setClauses = updateFields.map((field) => `${field}=?`).join(', ');
    const values = updateFields.map((field) => normalizedUpdates[field]);

    let updated = 0;
    for (const id of ids) {
      updated += run(`UPDATE income SET ${setClauses} WHERE id=?`, [...values, id]).changes;
    }

    res.json({ updated });
  } catch (error) {
    handleRouteError(res, error, 'Failed to bulk update income');
  }
});

router.put('/:id', (req, res) => {
  try {
    const id = parseIdParam(req.params.id, 'id');
    const income = parseIncomePayload(req.body);
    const result = run(
      'UPDATE income SET source=?, amount=?, date=?, recurrence=?, notes=?, account_id=?, is_transfer=?, ignore_dashboard=? WHERE id=?',
      [
        income.source,
        income.amount,
        income.date,
        income.recurrence,
        income.notes,
        income.account_id,
        income.is_transfer,
        income.ignore_dashboard,
        id,
      ]
    );

    if (result.changes === 0) {
      throw new HttpError(404, 'Income entry not found');
    }

    res.json({ id, ...income });
  } catch (error) {
    handleRouteError(res, error, 'Failed to update income');
  }
});

router.delete('/:id', (req, res) => {
  try {
    const id = parseIdParam(req.params.id, 'id');
    const result = run('DELETE FROM income WHERE id=?', [id]);

    if (result.changes === 0) {
      throw new HttpError(404, 'Income entry not found');
    }

    res.json({ success: true });
  } catch (error) {
    handleRouteError(res, error, 'Failed to delete income');
  }
});

export default router;
