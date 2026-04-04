import express from 'express';
import { all, get, run } from '../db.js';
import { handleRouteError, HttpError } from '../http.js';
import {
  CATEGORY_SET,
  parseEnum,
  parseIdParam,
  parsePositiveAmount,
} from '../validation.js';

const router = express.Router();

function parseGoalPayload(input) {
  return {
    category: parseEnum('category', input?.category, CATEGORY_SET),
    monthly_limit: parsePositiveAmount('monthly_limit', input?.monthly_limit, { allowZero: true }),
  };
}

router.get('/', (req, res) => {
  res.json(all('SELECT * FROM budget_goals ORDER BY category ASC'));
});

router.post('/', (req, res) => {
  try {
    const goal = parseGoalPayload(req.body);

    run(
      `
        INSERT INTO budget_goals (category, monthly_limit)
        VALUES (?, ?)
        ON CONFLICT(category) DO UPDATE SET monthly_limit = excluded.monthly_limit
      `,
      [goal.category, goal.monthly_limit]
    );

    const savedGoal = get('SELECT * FROM budget_goals WHERE category = ?', [goal.category]);
    res.status(201).json(savedGoal);
  } catch (error) {
    handleRouteError(res, error, 'Failed to save budget goal');
  }
});

router.put('/:id', (req, res) => {
  try {
    const id = parseIdParam(req.params.id, 'id');
    const goal = parseGoalPayload(req.body);
    const existingGoal = get('SELECT id FROM budget_goals WHERE category = ? AND id <> ?', [goal.category, id]);

    if (existingGoal) {
      throw new HttpError(409, 'A budget goal for this category already exists');
    }

    const result = run(
      'UPDATE budget_goals SET category=?, monthly_limit=? WHERE id=?',
      [goal.category, goal.monthly_limit, id]
    );

    if (result.changes === 0) {
      throw new HttpError(404, 'Budget goal not found');
    }

    res.json({ id, ...goal });
  } catch (error) {
    handleRouteError(res, error, 'Failed to update budget goal');
  }
});

router.delete('/:id', (req, res) => {
  try {
    const id = parseIdParam(req.params.id, 'id');
    const result = run('DELETE FROM budget_goals WHERE id=?', [id]);

    if (result.changes === 0) {
      throw new HttpError(404, 'Budget goal not found');
    }

    res.json({ success: true });
  } catch (error) {
    handleRouteError(res, error, 'Failed to delete budget goal');
  }
});

export default router;
