import express from 'express';
import { all, run } from '../db.js';
const router = express.Router();

router.get('/', (req, res) => {
  res.json(all('SELECT * FROM subscriptions ORDER BY name ASC'));
});

router.post('/', (req, res) => {
  const { name, amount, cycle = 'monthly', category = 'Other', renewal_date = null, notes = '' } = req.body;
  if (!name || !amount) return res.status(400).json({ error: 'name and amount are required' });
  const result = run(
    'INSERT INTO subscriptions (name, amount, cycle, category, renewal_date, notes) VALUES (?, ?, ?, ?, ?, ?)',
    [name, parseFloat(amount), cycle, category, renewal_date || '', notes]
  );
  res.status(201).json({ id: result.lastInsertRowid, name, amount: parseFloat(amount), cycle, category, renewal_date, active: 1, notes });
});

router.put('/:id', (req, res) => {
  const { name, amount, cycle, category, renewal_date, active, notes } = req.body;
  try {
    run(
      'UPDATE subscriptions SET name=?, amount=?, cycle=?, category=?, renewal_date=?, active=?, notes=? WHERE id=?',
      [name, parseFloat(amount), cycle, category, renewal_date || '', active ? 1 : 0, notes || '', parseInt(req.params.id)]
    );
    res.json({ id: parseInt(req.params.id), name, amount: parseFloat(amount), cycle, category, renewal_date, active, notes });
  } catch (e) {
    res.status(500).json({ error: 'Update failed' });
  }
});

router.delete('/:id', (req, res) => {
  run('DELETE FROM subscriptions WHERE id=?', [parseInt(req.params.id)]);
  res.json({ success: true });
});

export default router;
