import express from 'express';
import { all, get, run } from '../db.js';
import { handleRouteError, HttpError } from '../http.js';
import {
  CATEGORY_SET,
  MAX_IMPORT_ITEMS,
  PAYMENT_METHOD_SET,
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

function parseExpensePayload(input) {
  const payload = {
    description: parseRequiredString('description', input?.description, { max: 180 }),
    amount: parsePositiveAmount('amount', input?.amount),
    category: parseEnum('category', input?.category, CATEGORY_SET),
    date: parseDateString('date', input?.date),
    payment_method: parseEnum('payment_method', input?.payment_method, PAYMENT_METHOD_SET, { defaultValue: 'other' }),
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

    payload.category = 'Transfer';
    payload.payment_method = 'transfer';
  }

  return payload;
}

router.get('/', (req, res) => {
  try {
    const filters = parseMonthYearFilters(req.query);
    const category = req.query.category ? parseEnum('category', req.query.category, CATEGORY_SET) : null;

    let query = 'SELECT * FROM expenses WHERE 1=1';
    const params = [];

    if (filters) {
      query += ` AND strftime('%Y', date) = ? AND strftime('%m', date) = ?`;
      params.push(filters.year, filters.month);
    }

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    query += ' ORDER BY date DESC';
    res.json(all(query, params));
  } catch (error) {
    handleRouteError(res, error, 'Failed to fetch expenses');
  }
});

router.post('/', (req, res) => {
  try {
    const expense = parseExpensePayload(req.body);
    const result = run(
      'INSERT INTO expenses (description, amount, category, date, payment_method, notes, account_id, is_transfer, ignore_dashboard) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        expense.description,
        expense.amount,
        expense.category,
        expense.date,
        expense.payment_method,
        expense.notes,
        expense.account_id,
        expense.is_transfer,
        expense.ignore_dashboard,
      ]
    );

    res.status(201).json({ id: result.lastInsertRowid, ...expense });
  } catch (error) {
    handleRouteError(res, error, 'Failed to create expense');
  }
});

router.post('/import', (req, res) => {
  try {
    const expenses = assertMaxItems(req.body?.expenses, MAX_IMPORT_ITEMS, 'expenses');
    let imported = 0;
    let skipped = 0;
    let invalid = 0;

    for (const rawExpense of expenses) {
      try {
        const expense = parseExpensePayload(rawExpense);
        const exists = get(
          'SELECT id FROM expenses WHERE date=? AND amount=? AND description=?',
          [expense.date, expense.amount, expense.description]
        );

        if (exists) {
          skipped++;
          continue;
        }

        run(
          'INSERT INTO expenses (description, amount, category, date, payment_method, notes, account_id, is_transfer, ignore_dashboard) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            expense.description,
            expense.amount,
            expense.category,
            expense.date,
            expense.payment_method,
            expense.notes,
            expense.account_id,
            expense.is_transfer,
            expense.ignore_dashboard,
          ]
        );
        imported++;
      } catch (error) {
        invalid++;
      }
    }

    res.json({ imported, skipped, invalid });
  } catch (error) {
    handleRouteError(res, error, 'Failed to import expenses');
  }
});

router.delete('/bulk', (req, res) => {
  try {
    const ids = parseIdArray(req.body?.ids);
    let deleted = 0;

    for (const id of ids) {
      deleted += run('DELETE FROM expenses WHERE id=?', [id]).changes;
    }

    res.json({ deleted });
  } catch (error) {
    handleRouteError(res, error, 'Failed to delete expenses');
  }
});

router.put('/bulk', (req, res) => {
  try {
    const ids = parseIdArray(req.body?.ids);
    const updates = ensurePlainObject(req.body?.updates, 'updates');
    const allowedKeys = ['category', 'payment_method', 'account_id', 'ignore_dashboard'];
    const fields = Object.keys(updates).filter((key) => allowedKeys.includes(key));

    if (fields.length === 0) {
      throw new HttpError(400, 'No valid fields to update');
    }

    const normalizedUpdates = {};
    for (const field of fields) {
      if (field === 'category') {
        normalizedUpdates.category = parseEnum('category', updates.category, CATEGORY_SET);
      }
      if (field === 'payment_method') {
        normalizedUpdates.payment_method = parseEnum('payment_method', updates.payment_method, PAYMENT_METHOD_SET);
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
      updated += run(`UPDATE expenses SET ${setClauses} WHERE id=?`, [...values, id]).changes;
    }

    res.json({ updated });
  } catch (error) {
    handleRouteError(res, error, 'Failed to bulk update expenses');
  }
});

router.put('/bulk/categories', (req, res) => {
  try {
    const suggestions = ensurePlainObject(req.body?.suggestions, 'suggestions');
    const entries = Object.entries(suggestions);

    if (entries.length === 0) {
      throw new HttpError(400, 'No category updates were provided');
    }

    if (entries.length > MAX_IMPORT_ITEMS) {
      throw new HttpError(400, `suggestions cannot contain more than ${MAX_IMPORT_ITEMS} items`);
    }

    let updated = 0;
    for (const [rawId, rawCategory] of entries) {
      const id = parseIdParam(rawId, 'id');
      const category = parseEnum('category', rawCategory, CATEGORY_SET);
      updated += run('UPDATE expenses SET category=? WHERE id=?', [category, id]).changes;
    }

    res.json({ updated });
  } catch (error) {
    handleRouteError(res, error, 'Failed to update expense categories');
  }
});

router.put('/:id', (req, res) => {
  try {
    const id = parseIdParam(req.params.id, 'id');
    const expense = parseExpensePayload(req.body);
    const result = run(
      'UPDATE expenses SET description=?, amount=?, category=?, date=?, payment_method=?, notes=?, account_id=?, is_transfer=?, ignore_dashboard=? WHERE id=?',
      [
        expense.description,
        expense.amount,
        expense.category,
        expense.date,
        expense.payment_method,
        expense.notes,
        expense.account_id,
        expense.is_transfer,
        expense.ignore_dashboard,
        id,
      ]
    );

    if (result.changes === 0) {
      throw new HttpError(404, 'Expense not found');
    }

    res.json({ id, ...expense });
  } catch (error) {
    handleRouteError(res, error, 'Failed to update expense');
  }
});

router.delete('/:id', (req, res) => {
  try {
    const id = parseIdParam(req.params.id, 'id');
    const result = run('DELETE FROM expenses WHERE id=?', [id]);

    if (result.changes === 0) {
      throw new HttpError(404, 'Expense not found');
    }

    res.json({ success: true });
  } catch (error) {
    handleRouteError(res, error, 'Failed to delete expense');
  }
});

export default router;
