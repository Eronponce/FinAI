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
  const { description, amount, category, date, payment_method = 'other', notes = '', account_id = null, is_transfer = 0, ignore_dashboard = 0 } = req.body;
  if (!description || !amount || !category || !date) {
    return res.status(400).json({ error: 'description, amount, category, and date are required' });
  }
  const result = run(
    'INSERT INTO expenses (description, amount, category, date, payment_method, notes, account_id, is_transfer, ignore_dashboard) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [description, parseFloat(amount), category, date, payment_method, notes, account_id, is_transfer ? 1 : 0, ignore_dashboard ? 1 : 0]
  );
  res.status(201).json({ id: result.lastInsertRowid, description, amount: parseFloat(amount), category, date, payment_method, notes, account_id, is_transfer: is_transfer ? 1 : 0, ignore_dashboard: ignore_dashboard ? 1 : 0 });
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
      'INSERT INTO expenses (description, amount, category, date, payment_method, notes, account_id, is_transfer, ignore_dashboard) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [e.description || 'Imported', parseFloat(e.amount), e.category || 'Other', e.date, e.payment_method || 'other', e.notes || '', e.account_id || null, e.is_transfer ? 1 : 0, e.ignore_dashboard ? 1 : 0]
    );
    imported++;
  }
  res.json({ imported, skipped });
});

router.delete('/bulk', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });
  for (const id of ids) run('DELETE FROM expenses WHERE id=?', [parseInt(id)]);
  res.json({ deleted: ids.length });
});

router.put('/bulk', (req, res) => {
  const { ids, updates } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });
  if (!updates || typeof updates !== 'object') return res.status(400).json({ error: 'updates object required' });
  const allowed = ['category', 'payment_method', 'account_id', 'ignore_dashboard'];
  const fields = Object.keys(updates).filter(k => allowed.includes(k));
  if (fields.length === 0) return res.status(400).json({ error: 'no valid fields to update' });
  const setClauses = fields.map(f => `${f}=?`).join(', ');
  const values = fields.map(f => f === 'ignore_dashboard' ? (updates[f] ? 1 : 0) : (updates[f] ?? null));
  for (const id of ids) run(`UPDATE expenses SET ${setClauses} WHERE id=?`, [...values, parseInt(id)]);
  res.json({ updated: ids.length });
});

router.put('/:id', (req, res) => {
  const { description, amount, category, date, payment_method, notes, account_id, is_transfer, ignore_dashboard } = req.body;
  try {
    run(
      'UPDATE expenses SET description=?, amount=?, category=?, date=?, payment_method=?, notes=?, account_id=?, is_transfer=?, ignore_dashboard=? WHERE id=?',
      [description, parseFloat(amount), category, date, payment_method, notes || '', account_id || null, is_transfer ? 1 : 0, ignore_dashboard ? 1 : 0, parseInt(req.params.id)]
    );
    res.json({ id: parseInt(req.params.id), description, amount: parseFloat(amount), category, date, payment_method, notes, account_id, is_transfer: is_transfer ? 1 : 0, ignore_dashboard: ignore_dashboard ? 1 : 0 });
  } catch (e) {
    res.status(500).json({ error: 'Update failed' });
  }
});

router.delete('/:id', (req, res) => {
  run('DELETE FROM expenses WHERE id=?', [parseInt(req.params.id)]);
  res.json({ success: true });
});

export default router;
