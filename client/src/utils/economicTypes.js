export const ECONOMIC_TYPE_OPTIONS = [
  { value: 'consumption_expense', label: 'Gasto real', bucket: 'spend' },
  { value: 'external_income', label: 'Entrada real', bucket: 'income' },
  { value: 'reimbursement_in', label: 'Reembolso', bucket: 'reimbursement' },
  { value: 'internal_transfer_in', label: 'Transferencia in', bucket: 'internal_transfer_in' },
  { value: 'internal_transfer_out', label: 'Transferencia out', bucket: 'internal_transfer_out' },
  { value: 'investment_contribution', label: 'Investimento out', bucket: 'investment_out' },
  { value: 'investment_redemption', label: 'Investimento in', bucket: 'investment_in' },
  { value: 'card_payment', label: 'Fatura', bucket: 'card_payment' },
  { value: 'refund', label: 'Estorno', bucket: 'refund' },
  { value: 'unknown', label: 'Indefinido', bucket: 'unknown' },
];

export const ECONOMIC_TYPE_MAP = Object.fromEntries(
  ECONOMIC_TYPE_OPTIONS.map((item) => [item.value, item])
);

export function getEconomicTypeLabel(value) {
  return ECONOMIC_TYPE_MAP[value]?.label || value || 'Sem classificacao';
}
