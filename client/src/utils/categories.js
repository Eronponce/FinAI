export const CATEGORIES = [
  { id: 'Food',          label: 'Food & Dining',    icon: '🍽️',  color: '#d4af37' },
  { id: 'Housing',       label: 'Housing',           icon: '🏠',  color: '#f0d58a' },
  { id: 'Transport',     label: 'Transport',         icon: '🚗',  color: '#b6823c' },
  { id: 'Health',        label: 'Health',            icon: '💊',  color: '#7f9b63' },
  { id: 'Entertainment', label: 'Entertainment',     icon: '🎬',  color: '#9f4f3d' },
  { id: 'Shopping',      label: 'Shopping',          icon: '🛍️',  color: '#c8845c' },
  { id: 'Subscriptions', label: 'Subscriptions',     icon: '📱',  color: '#8b7a4b' },
  { id: 'Education',     label: 'Education',         icon: '📚',  color: '#c7a45a' },
  { id: 'Investments',   label: 'Investments',       icon: '📈',  color: '#5e8d78' },
  { id: 'Transfer',      label: 'Transfer',          icon: '↔️',  color: '#8e8572' },
  { id: 'Other',         label: 'Other',             icon: '📦',  color: '#706756' },
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
