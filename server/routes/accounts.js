import express from 'express';
import { all, get, run } from '../db.js';
import { handleRouteError, HttpError } from '../http.js';
import {
  ACCOUNT_TYPE_SET,
  CURRENCY_CODE_SET,
  parseEnum,
  parseFiniteNumber,
  parseIdParam,
  parseRequiredString,
} from '../validation.js';

const router = express.Router();

function parseAccountPayload(input) {
  return {
    name: parseRequiredString('name', input?.name, { max: 80 }),
    type: parseEnum('type', input?.type, ACCOUNT_TYPE_SET),
    balance: parseFiniteNumber('balance', input?.balance),
    currency: input?.currency ? parseEnum('currency', input.currency, CURRENCY_CODE_SET) : '',
  };
}

router.get('/', (req, res) => {
  res.json(all('SELECT * FROM accounts ORDER BY created_at ASC'));
});

router.post('/', (req, res) => {
  try {
    const account = parseAccountPayload(req.body);
    const result = run(
      'INSERT INTO accounts (name, type, balance, currency) VALUES (?, ?, ?, ?)',
      [account.name, account.type, account.balance, account.currency]
    );

    res.status(201).json({ id: result.lastInsertRowid, ...account });
  } catch (error) {
    handleRouteError(res, error, 'Failed to create account');
  }
});

router.put('/:id', (req, res) => {
  try {
    const id = parseIdParam(req.params.id, 'id');
    const account = parseAccountPayload(req.body);
    const result = run(
      'UPDATE accounts SET name=?, type=?, balance=?, currency=? WHERE id=?',
      [account.name, account.type, account.balance, account.currency, id]
    );

    if (result.changes === 0) {
      throw new HttpError(404, 'Account not found');
    }

    res.json({ id, ...account });
  } catch (error) {
    handleRouteError(res, error, 'Failed to update account');
  }
});

router.delete('/:id', (req, res) => {
  try {
    const id = parseIdParam(req.params.id, 'id');
    const linkedTransactions = get(`
      SELECT
        (SELECT COUNT(*) FROM income WHERE account_id = ?) +
        (SELECT COUNT(*) FROM expenses WHERE account_id = ?) AS count
    `, [id, id]);

    if (Number(linkedTransactions?.count) > 0) {
      throw new HttpError(
        409,
        'This account still has linked income or expenses. Reassign or remove those entries first.'
      );
    }

    const result = run('DELETE FROM accounts WHERE id=?', [id]);
    if (result.changes === 0) {
      throw new HttpError(404, 'Account not found');
    }

    res.json({ success: true });
  } catch (error) {
    handleRouteError(res, error, 'Failed to delete account');
  }
});

export default router;
