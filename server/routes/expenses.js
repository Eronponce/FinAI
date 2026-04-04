import express from 'express';
import { all, get, run } from '../db.js';
const router = express.Router();

router.get('/', (req, res) => {
  const { month, year, category } = req.query;
  let query = 'SELECT * FROM expenses WHERE 1=1';
  const params = [];
  if (month && year) {
    query += ` AND strftime('%Y', date) = ? AND strftime('%m', date) = ?`;
    params.push(year, month.padStart(2, '0'));
  }
  if (category) {
    query += ' AND category = ?';
    params.push(category);
  }
  query += ' ORDER BY date DESC';
  res.json(all(query, params));
});

router.post('/', (req, res) => {
  const { description, amount, category, date, payment_method = 'other', notes = '' } = req.body;
  if (!description || !amount || !category || !date) {
    return res.status(400).json({ error: 'description, amount, category, and date are required' });
  }
  const result = run(
    'INSERT INTO expenses (description, amount, category, date, payment_method, notes) VALUES (?, ?, ?, ?, ?, ?)',
    [description, parseFloat(amount), category, date, payment_method, notes]
  );
  res.status(201).json({ id: result.lastInsertRowid, description, amount: parseFloat(amount), category, date, payment_method, notes });
});

// Bulk import (from CSV)
router.post('/import', (req, res) => {
  const { expenses } = req.body;
  if (!Array.isArray(expenses) || expenses.length === 0) {
    return res.status(400).json({ error: 'expenses array is required' });
  }
  let imported = 0, skipped = 0;
  for (const e of expenses) {
    const exists = get(
      'SELECT id FROM expenses WHERE date=? AND amount=? AND description=?',
      [e.date, parseFloat(e.amount), e.description]
    );
    if (exists) { skipped++; continue; }
    run(
      'INSERT INTO expenses (description, amount, category, date, payment_method, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [e.description || 'Imported', parseFloat(e.amount), e.category || 'Other', e.date, e.payment_method || 'other', e.notes || '']
    );
    imported++;
  }
  res.json({ imported, skipped });
});

router.put('/:id', (req, res) => {
  const { description, amount, category, date, payment_method, notes } = req.body;
  try {
    run(
      'UPDATE expenses SET description=?, amount=?, category=?, date=?, payment_method=?, notes=? WHERE id=?',
      [description, parseFloat(amount), category, date, payment_method, notes || '', parseInt(req.params.id)]
    );
    res.json({ id: parseInt(req.params.id), description, amount: parseFloat(amount), category, date, payment_method, notes });
  } catch (e) {
    res.status(500).json({ error: 'Update failed' });
  }
});

router.delete('/:id', (req, res) => {
  run('DELETE FROM expenses WHERE id=?', [parseInt(req.params.id)]);
  res.json({ success: true });
});

export default router;
