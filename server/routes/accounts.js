import express from 'express';
import { all, get, run } from '../db.js';
const router = express.Router();

router.get('/', (req, res) => {
  res.json(all('SELECT * FROM accounts ORDER BY created_at ASC'));
});

router.post('/', (req, res) => {
  const { name, type, balance, currency = '' } = req.body;
  if (!name || !type || balance === undefined) {
    return res.status(400).json({ error: 'name, type, and balance are required' });
  }
  const result = run(
    'INSERT INTO accounts (name, type, balance, currency) VALUES (?, ?, ?, ?)',
    [name, type, parseFloat(balance), currency]
  );
  res.status(201).json({ id: result.lastInsertRowid, name, type, balance: parseFloat(balance), currency });
});

router.put('/:id', (req, res) => {
  const { name, type, balance, currency } = req.body;
  try {
    run('UPDATE accounts SET name=?, type=?, balance=?, currency=? WHERE id=?',
      [name, type, parseFloat(balance), currency || '', parseInt(req.params.id)]);
    res.json({ id: parseInt(req.params.id), name, type, balance: parseFloat(balance), currency });
  } catch (e) {
    res.status(404).json({ error: 'Not found or update failed' });
  }
});

router.delete('/:id', (req, res) => {
  run('DELETE FROM accounts WHERE id=?', [parseInt(req.params.id)]);
  res.json({ success: true });
});

export default router;
