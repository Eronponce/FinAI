import express from 'express';
import { all, get, run } from '../db.js';
const router = express.Router();

router.get('/', (req, res) => {
  const { month, year } = req.query;
  let query = 'SELECT * FROM income';
  const params = [];
  if (month && year) {
    query += ` WHERE strftime('%Y', date) = ? AND strftime('%m', date) = ?`;
    params.push(year, month.padStart(2, '0'));
  }
  query += ' ORDER BY date DESC';
  res.json(all(query, params));
});

router.post('/', (req, res) => {
  const { source, amount, date, recurrence = 'one-time', notes = '' } = req.body;
  if (!source || !amount || !date) {
    return res.status(400).json({ error: 'source, amount, and date are required' });
  }
  const result = run(
    'INSERT INTO income (source, amount, date, recurrence, notes) VALUES (?, ?, ?, ?, ?)',
    [source, parseFloat(amount), date, recurrence, notes]
  );
  res.status(201).json({ id: result.lastInsertRowid, source, amount: parseFloat(amount), date, recurrence, notes });
});

// Bulk import (from CSV)
router.post('/import', (req, res) => {
  const { incomes } = req.body;
  if (!Array.isArray(incomes) || incomes.length === 0) {
    return res.status(400).json({ error: 'incomes array is required' });
  }
  let imported = 0, skipped = 0;
  for (const i of incomes) {
    const exists = get(
      'SELECT id FROM income WHERE date=? AND amount=? AND source=?',
      [i.date, parseFloat(i.amount), i.source || i.description]
    );
    if (exists) { skipped++; continue; }
    run(
      'INSERT INTO income (source, amount, date, recurrence, notes) VALUES (?, ?, ?, ?, ?)',
      [i.source || i.description || 'Imported', parseFloat(i.amount), i.date, 'one-time', i.notes || '']
    );
    imported++;
  }
  res.json({ imported, skipped });
});

router.put('/:id', (req, res) => {
  const { source, amount, date, recurrence, notes } = req.body;
  try {
    run('UPDATE income SET source=?, amount=?, date=?, recurrence=?, notes=? WHERE id=?',
      [source, parseFloat(amount), date, recurrence, notes || '', parseInt(req.params.id)]);
    res.json({ id: parseInt(req.params.id), source, amount: parseFloat(amount), date, recurrence, notes });
  } catch (e) {
    res.status(404).json({ error: 'Not found or update failed' });
  }
});

router.delete('/:id', (req, res) => {
  run('DELETE FROM income WHERE id=?', [parseInt(req.params.id)]);
  res.json({ success: true });
});

export default router;
