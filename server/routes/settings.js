import express from 'express';
import { all, run } from '../db.js';
import { handleRouteError, HttpError } from '../http.js';
import {
  CURRENCY_CODE_SET,
  CURRENCY_SYMBOL_BY_CODE,
  RESET_CONFIRMATION_HEADER,
  RESET_CONFIRMATION_VALUE,
  ensurePlainObject,
  parseEnum,
} from '../validation.js';

const router = express.Router();

function readSettings() {
  const settings = {};
  for (const row of all('SELECT key, value FROM settings')) {
    settings[row.key] = row.value;
  }
  return settings;
}

function parseSettingsUpdates(input) {
  const updates = ensurePlainObject(input);
  const parsedUpdates = {};

  if (updates.currency !== undefined) {
    const currency = parseEnum('currency', updates.currency, CURRENCY_CODE_SET);
    parsedUpdates.currency = currency;
    parsedUpdates.currency_symbol = CURRENCY_SYMBOL_BY_CODE[currency];
  }

  if (Object.keys(parsedUpdates).length === 0) {
    throw new HttpError(400, 'No valid settings were provided');
  }

  return parsedUpdates;
}

router.get('/', (req, res) => {
  res.json(readSettings());
});

router.put('/', (req, res) => {
  try {
    const updates = parseSettingsUpdates(req.body);

    for (const [key, value] of Object.entries(updates)) {
      run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, String(value)]);
    }

    res.json(readSettings());
  } catch (error) {
    handleRouteError(res, error, 'Failed to update settings');
  }
});

router.post('/reset', (req, res) => {
  try {
    const confirmation = req.get(RESET_CONFIRMATION_HEADER);
    if (confirmation !== RESET_CONFIRMATION_VALUE || req.body?.confirmation !== RESET_CONFIRMATION_VALUE) {
      throw new HttpError(400, 'Reset confirmation is required');
    }

    run('DELETE FROM income');
    run('DELETE FROM expenses');
    run('DELETE FROM subscriptions');
    run('DELETE FROM budget_goals');
    run('DELETE FROM accounts');
    run('DELETE FROM settings');
    run('DELETE FROM import_rules');
    run('DELETE FROM import_batches');
    run('DELETE FROM economic_rules');
    run('DELETE FROM economic_movements');

    run("INSERT OR IGNORE INTO settings (key, value) VALUES ('currency', 'BRL')");
    run("INSERT OR IGNORE INTO settings (key, value) VALUES ('currency_symbol', 'R$')");

    res.json({ success: true });
  } catch (error) {
    handleRouteError(res, error, 'Failed to reset database');
  }
});

export default router;
