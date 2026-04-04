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
  const { source, amount, date, recurrence = 'one-time', notes = '', account_id = null, is_transfer = 0, ignore_dashboard = 0 } = req.body;
  if (!source || !amount || !date) {
    return res.status(400).json({ error: 'source, amount, and date are required' });
  }
  const result = run(
    'INSERT INTO income (source, amount, date, recurrence, notes, account_id, is_transfer, ignore_dashboard) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [source, parseFloat(amount), date, recurrence, notes, account_id, is_transfer ? 1 : 0, ignore_dashboard ? 1 : 0]
  );
  res.status(201).json({ id: result.lastInsertRowid, source, amount: parseFloat(amount), date, recurrence, notes, account_id, is_transfer: is_transfer ? 1 : 0, ignore_dashboard: ignore_dashboard ? 1 : 0 });
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
      'INSERT INTO income (source, amount, date, recurrence, notes, account_id, is_transfer, ignore_dashboard) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [i.source || i.description || 'Imported', parseFloat(i.amount), i.date, 'one-time', i.notes || '', i.account_id || null, i.is_transfer ? 1 : 0, i.ignore_dashboard ? 1 : 0]
    );
    imported++;
  }
  res.json({ imported, skipped });
});

router.put('/:id', (req, res) => {
  const { source, amount, date, recurrence, notes, account_id, is_transfer, ignore_dashboard } = req.body;
  try {
    run('UPDATE income SET source=?, amount=?, date=?, recurrence=?, notes=?, account_id=?, is_transfer=?, ignore_dashboard=? WHERE id=?',
      [source, parseFloat(amount), date, recurrence, notes || '', account_id || null, is_transfer ? 1 : 0, ignore_dashboard ? 1 : 0, parseInt(req.params.id)]);
    res.json({ id: parseInt(req.params.id), source, amount: parseFloat(amount), date, recurrence, notes, account_id, is_transfer: is_transfer ? 1 : 0, ignore_dashboard: ignore_dashboard ? 1 : 0 });
  } catch (e) {
    res.status(404).json({ error: 'Not found or update failed' });
  }
});

router.delete('/:id', (req, res) => {
  run('DELETE FROM income WHERE id=?', [parseInt(req.params.id)]);
  res.json({ success: true });
});

export default router;
