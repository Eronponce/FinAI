export const CATEGORIES = [
  { id: 'Food',          label: 'Food & Dining',    icon: '🍽️',  color: '#f59e0b' },
  { id: 'Housing',       label: 'Housing',           icon: '🏠',  color: '#3b82f6' },
  { id: 'Transport',     label: 'Transport',         icon: '🚗',  color: '#8b5cf6' },
  { id: 'Health',        label: 'Health',            icon: '💊',  color: '#10b981' },
  { id: 'Entertainment', label: 'Entertainment',     icon: '🎬',  color: '#f43f5e' },
  { id: 'Shopping',      label: 'Shopping',          icon: '🛍️',  color: '#ec4899' },
  { id: 'Subscriptions', label: 'Subscriptions',     icon: '📱',  color: '#06b6d4' },
  { id: 'Education',     label: 'Education',         icon: '📚',  color: '#a78bfa' },
  { id: 'Investments',   label: 'Investments',       icon: '📈',  color: '#34d399' },
  { id: 'Other',         label: 'Other',             icon: '📦',  color: '#64748b' },
];

export const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));

export const getCategoryColor = (id) => CATEGORY_MAP[id]?.color || '#64748b';
export const getCategoryIcon  = (id) => CATEGORY_MAP[id]?.icon  || '📦';

export const RECURRENCE_OPTIONS = [
  { value: 'one-time',   label: 'One-time' },
  { value: 'weekly',     label: 'Weekly' },
  { value: 'bi-weekly',  label: 'Bi-weekly' },
  { value: 'monthly',    label: 'Monthly' },
  { value: 'yearly',     label: 'Yearly' },
];

export const CYCLE_OPTIONS = [
  { value: 'weekly',   label: 'Weekly' },
  { value: 'monthly',  label: 'Monthly' },
  { value: 'yearly',   label: 'Yearly' },
];

export const PAYMENT_METHODS = [
  { value: 'credit',   label: 'Credit Card' },
  { value: 'debit',    label: 'Debit Card' },
  { value: 'pix',      label: 'Pix' },
  { value: 'cash',     label: 'Cash' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'other',    label: 'Other' },
];

export const CURRENCIES = [
  { code: 'BRL', symbol: 'R$',  label: 'Brazilian Real (R$)' },
  { code: 'USD', symbol: '$',   label: 'US Dollar ($)' },
  { code: 'EUR', symbol: '€',   label: 'Euro (€)' },
  { code: 'GBP', symbol: '£',   label: 'British Pound (£)' },
  { code: 'ARS', symbol: '$',   label: 'Argentine Peso ($)' },
];
