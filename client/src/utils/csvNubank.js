/**
 * Nubank CSV format (credit card):
 *   date,category,title,amount
 *   2024-01-15,Restaurantes,iFood,45.90
 *
 * Nubank account CSV:
 *   Data,Valor,Identificador,Descrição
 *
 * This parser handles both and normalises to our internal format.
 */

import { CATEGORIES } from './categories.js';

// Map Nubank categories → our categories
const NUBANK_CAT_MAP = {
  'restaurantes': 'Food',
  'alimentação': 'Food',
  'mercado': 'Food',
  'supermercado': 'Food',
  'transporte': 'Transport',
  'uber': 'Transport',
  '99': 'Transport',
  'saúde': 'Health',
  'farmácia': 'Health',
  'entretenimento': 'Entertainment',
  'streaming': 'Subscriptions',
  'assinaturas': 'Subscriptions',
  'educação': 'Education',
  'casa': 'Housing',
  'moradia': 'Housing',
  'compras': 'Shopping',
  'roupas': 'Shopping',
  'eletrônicos': 'Shopping',
};

function mapNubankCategory(raw) {
  if (!raw) return 'Other';
  const lower = raw.toLowerCase().trim();
  for (const [key, val] of Object.entries(NUBANK_CAT_MAP)) {
    if (lower.includes(key)) return val;
  }
  return 'Other';
}

function parseDate(raw) {
  if (!raw) return new Date().toISOString().slice(0, 10);
  // DD/MM/YYYY → YYYY-MM-DD
  const dmy = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  // YYYY-MM-DD already fine
  const ymd = raw.match(/^\d{4}-\d{2}-\d{2}/);
  if (ymd) return raw.slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

function findColumn(headers, candidates) {
  for (const c of candidates) {
    const found = headers.find(h => h.toLowerCase().trim() === c.toLowerCase());
    if (found) return found;
  }
  return null;
}

export function parseNubankCSV(rows) {
  if (!rows || rows.length === 0) return [];
  const headers = Object.keys(rows[0]);

  const dateCol   = findColumn(headers, ['date', 'data']);
  const amountCol = findColumn(headers, ['amount', 'valor']);
  const descCol   = findColumn(headers, ['title', 'título', 'descrição', 'description', 'identificador']);
  const catCol    = findColumn(headers, ['category', 'categoria']);

  return rows
    .filter(row => {
      const amt = parseFloat(String(row[amountCol] || '').replace(',', '.'));
      return !isNaN(amt) && amt !== 0;
    })
    .map(row => {
      const raw = String(row[amountCol] || '0').replace(',', '.');
      const parsedAmt = parseFloat(raw);
      
      const isAccount = headers.some(h => h.toLowerCase() === 'identificador');
      let type = 'expense';
      
      if (isAccount) {
        // Nubank Account CSV: Income is positive, Expense is negative
        type = parsedAmt > 0 ? 'income' : 'expense';
      } else {
        // Nubank Credit Card CSV: Expenses are positive, Payments are negative
        type = parsedAmt < 0 ? 'income' : 'expense';
      }
      
      const amount = Math.abs(parsedAmt);
      
      return {
        date: parseDate(row[dateCol]),
        description: row[descCol] || 'Imported',
        amount,
        type,
        category: catCol ? mapNubankCategory(row[catCol]) : 'Other',
        payment_method: 'credit',
        notes: '',
      };
    });
}
