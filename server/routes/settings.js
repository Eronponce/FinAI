import express from 'express';
import { all, run } from '../db.js';
const router = express.Router();

router.get('/', (req, res) => {
  const rows = all('SELECT key, value FROM settings');
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.json(settings);
});

router.put('/', (req, res) => {
  const updates = req.body;
  for (const [key, value] of Object.entries(updates)) {
    run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, String(value)]);
  }
  const rows = all('SELECT key, value FROM settings');
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.json(settings);
});

router.post('/reset', (req, res) => {
  try {
    run('DELETE FROM income');
    run('DELETE FROM expenses');
    run('DELETE FROM subscriptions');
    run('DELETE FROM budget_goals');
    run('DELETE FROM settings');
    
    // Restore default settings
    run("INSERT OR IGNORE INTO settings (key, value) VALUES ('currency', 'BRL')");
    run("INSERT OR IGNORE INTO settings (key, value) VALUES ('currency_symbol', 'R$')");
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset database' });
  }
});

export default router;
