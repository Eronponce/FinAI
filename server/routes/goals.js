import express from 'express';
import { all, run } from '../db.js';
const router = express.Router();

router.get('/', (req, res) => {
  res.json(all('SELECT * FROM budget_goals ORDER BY category ASC'));
});

router.post('/', (req, res) => {
  const { category, monthly_limit } = req.body;
  if (!category || !monthly_limit) return res.status(400).json({ error: 'category and monthly_limit are required' });
  const result = run(
    'INSERT OR REPLACE INTO budget_goals (category, monthly_limit) VALUES (?, ?)',
    [category, parseFloat(monthly_limit)]
  );
  res.status(201).json({ id: result.lastInsertRowid, category, monthly_limit: parseFloat(monthly_limit) });
});

router.put('/:id', (req, res) => {
  const { category, monthly_limit } = req.body;
  run('UPDATE budget_goals SET category=?, monthly_limit=? WHERE id=?',
    [category, parseFloat(monthly_limit), parseInt(req.params.id)]);
  res.json({ id: parseInt(req.params.id), category, monthly_limit: parseFloat(monthly_limit) });
});

router.delete('/:id', (req, res) => {
  run('DELETE FROM budget_goals WHERE id=?', [parseInt(req.params.id)]);
  res.json({ success: true });
});

export default router;
