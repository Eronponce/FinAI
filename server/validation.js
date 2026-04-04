import { HttpError } from './http.js';

export const APP_REQUEST_HEADER = 'x-finance-app-request';
export const APP_REQUEST_HEADER_VALUE = '1';
export const RESET_CONFIRMATION_HEADER = 'x-reset-confirmation';
export const RESET_CONFIRMATION_VALUE = 'RESET-ALL-DATA';

export const ACCOUNT_TYPES = ['Checking', 'Savings', 'Credit', 'Investment', 'Cash'];
export const ACCOUNT_TYPE_SET = new Set(ACCOUNT_TYPES);

export const CATEGORIES = [
  'Food',
  'Housing',
  'Transport',
  'Health',
  'Entertainment',
  'Shopping',
  'Subscriptions',
  'Education',
  'Investments',
  'Transfer',
  'Other',
];
export const CATEGORY_SET = new Set(CATEGORIES);

export const PAYMENT_METHODS = ['credit', 'debit', 'pix', 'cash', 'transfer', 'other'];
export const PAYMENT_METHOD_SET = new Set(PAYMENT_METHODS);

export const RECURRENCES = ['one-time', 'weekly', 'bi-weekly', 'monthly', 'yearly'];
export const RECURRENCE_SET = new Set(RECURRENCES);

export const CYCLES = ['weekly', 'monthly', 'yearly'];
export const CYCLE_SET = new Set(CYCLES);

export const CURRENCY_SYMBOL_BY_CODE = {
  BRL: 'R$',
  USD: '$',
  EUR: '€',
  GBP: '£',
  ARS: '$',
};
export const CURRENCY_CODE_SET = new Set(Object.keys(CURRENCY_SYMBOL_BY_CODE));

export const MAX_BULK_ITEMS = 500;
export const MAX_IMPORT_ITEMS = 1000;
export const MAX_AI_SUGGESTION_ITEMS = 200;

function badRequest(message) {
  return new HttpError(400, message);
}

export function ensurePlainObject(value, field = 'body') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw badRequest(`${field} must be an object`);
  }

  return value;
}

export function parseRequiredString(field, value, { max = 160 } = {}) {
  const parsed = String(value ?? '').trim();
  if (!parsed) {
    throw badRequest(`${field} is required`);
  }
  if (parsed.length > max) {
    throw badRequest(`${field} must be ${max} characters or fewer`);
  }
  return parsed;
}

export function parseOptionalString(value, { max = 1000, defaultValue = '' } = {}) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }

  const parsed = String(value).trim();
  if (parsed.length > max) {
    throw badRequest(`Value must be ${max} characters or fewer`);
  }
  return parsed;
}

export function parseEnum(field, value, allowedValues, { defaultValue } = {}) {
  if ((value === undefined || value === null || value === '') && defaultValue !== undefined) {
    return defaultValue;
  }

  const parsed = String(value ?? '').trim();
  if (!allowedValues.has(parsed)) {
    throw badRequest(`${field} is invalid`);
  }
  return parsed;
}

export function parseDateString(field, value) {
  const parsed = parseRequiredString(field, value, { max: 10 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed)) {
    throw badRequest(`${field} must be a valid YYYY-MM-DD date`);
  }

  const parsedDate = new Date(`${parsed}T00:00:00Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== parsed) {
    throw badRequest(`${field} must be a valid YYYY-MM-DD date`);
  }

  return parsed;
}

export function parsePositiveAmount(field, value, { allowZero = false, max = 1_000_000_000 } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw badRequest(`${field} must be a valid number`);
  }
  if (allowZero ? parsed < 0 : parsed <= 0) {
    throw badRequest(`${field} must be ${allowZero ? 'zero or greater' : 'greater than zero'}`);
  }
  if (Math.abs(parsed) > max) {
    throw badRequest(`${field} is too large`);
  }
  return Number(parsed.toFixed(2));
}

export function parseFiniteNumber(field, value, { min = -1_000_000_000, max = 1_000_000_000 } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw badRequest(`${field} must be a valid number`);
  }
  if (parsed < min || parsed > max) {
    throw badRequest(`${field} is out of range`);
  }
  return Number(parsed.toFixed(2));
}

export function parseOptionalId(value, field = 'id') {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw badRequest(`${field} must be a positive integer`);
  }

  return parsed;
}

export function parseIdParam(value, field = 'id') {
  const parsed = parseOptionalId(value, field);
  if (parsed === null) {
    throw badRequest(`${field} is required`);
  }
  return parsed;
}

export function parseBooleanFlag(value, field = 'value') {
  if (value === true || value === 1 || value === '1' || value === 'true') {
    return 1;
  }
  if (
    value === false ||
    value === 0 ||
    value === '0' ||
    value === 'false' ||
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return 0;
  }

  throw badRequest(`${field} must be a boolean`);
}

export function parseIdArray(values, field = 'ids', maxItems = MAX_BULK_ITEMS) {
  if (!Array.isArray(values) || values.length === 0) {
    throw badRequest(`${field} array is required`);
  }
  if (values.length > maxItems) {
    throw badRequest(`${field} cannot contain more than ${maxItems} items`);
  }

  return [...new Set(values.map((value) => parseIdParam(value, field)))];
}

export function parseMonthYearFilters({ month, year }) {
  if ((month === undefined || month === '') && (year === undefined || year === '')) {
    return null;
  }

  if (!month || !year) {
    throw badRequest('month and year must be provided together');
  }

  const parsedYear = String(year).trim();
  const parsedMonth = String(month).trim().padStart(2, '0');

  if (!/^\d{4}$/.test(parsedYear)) {
    throw badRequest('year must be a 4-digit number');
  }
  if (!/^(0[1-9]|1[0-2])$/.test(parsedMonth)) {
    throw badRequest('month must be between 01 and 12');
  }

  return { month: parsedMonth, year: parsedYear };
}

export function assertMaxItems(items, maxItems, field) {
  if (!Array.isArray(items) || items.length === 0) {
    throw badRequest(`${field} array is required`);
  }
  if (items.length > maxItems) {
    throw badRequest(`${field} cannot contain more than ${maxItems} items`);
  }
  return items;
}
