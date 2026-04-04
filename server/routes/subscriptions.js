import express from 'express';
import { all, run } from '../db.js';
import { handleRouteError, HttpError } from '../http.js';
import {
  CATEGORY_SET,
  CYCLE_SET,
  parseBooleanFlag,
  parseDateString,
  parseEnum,
  parseIdParam,
  parseOptionalString,
  parsePositiveAmount,
  parseRequiredString,
} from '../validation.js';

const router = express.Router();

function parseSubscriptionPayload(input) {
  return {
    name: parseRequiredString('name', input?.name, { max: 120 }),
    amount: parsePositiveAmount('amount', input?.amount),
    cycle: parseEnum('cycle', input?.cycle, CYCLE_SET, { defaultValue: 'monthly' }),
    category: parseEnum('category', input?.category, CATEGORY_SET, { defaultValue: 'Subscriptions' }),
    renewal_date: input?.renewal_date ? parseDateString('renewal_date', input.renewal_date) : '',
    active: parseBooleanFlag(input?.active, 'active'),
    notes: parseOptionalString(input?.notes, { max: 500 }),
  };
}

router.get('/', (req, res) => {
  res.json(all('SELECT * FROM subscriptions ORDER BY name ASC'));
});

router.post('/', (req, res) => {
  try {
    const subscription = parseSubscriptionPayload({ ...req.body, active: 1 });
    const result = run(
      'INSERT INTO subscriptions (name, amount, cycle, category, renewal_date, active, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        subscription.name,
        subscription.amount,
        subscription.cycle,
        subscription.category,
        subscription.renewal_date,
        subscription.active,
        subscription.notes,
      ]
    );

    res.status(201).json({ id: result.lastInsertRowid, ...subscription });
  } catch (error) {
    handleRouteError(res, error, 'Failed to create subscription');
  }
});

router.put('/:id', (req, res) => {
  try {
    const id = parseIdParam(req.params.id, 'id');
    const subscription = parseSubscriptionPayload(req.body);
    const result = run(
      'UPDATE subscriptions SET name=?, amount=?, cycle=?, category=?, renewal_date=?, active=?, notes=? WHERE id=?',
      [
        subscription.name,
        subscription.amount,
        subscription.cycle,
        subscription.category,
        subscription.renewal_date,
        subscription.active,
        subscription.notes,
        id,
      ]
    );

    if (result.changes === 0) {
      throw new HttpError(404, 'Subscription not found');
    }

    res.json({ id, ...subscription });
  } catch (error) {
    handleRouteError(res, error, 'Failed to update subscription');
  }
});

router.delete('/:id', (req, res) => {
  try {
    const id = parseIdParam(req.params.id, 'id');
    const result = run('DELETE FROM subscriptions WHERE id=?', [id]);

    if (result.changes === 0) {
      throw new HttpError(404, 'Subscription not found');
    }

    res.json({ success: true });
  } catch (error) {
    handleRouteError(res, error, 'Failed to delete subscription');
  }
});

export default router;
