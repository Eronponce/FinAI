function parseDate(raw) {
  if (!raw) return new Date().toISOString().slice(0, 10);

  const dmy = String(raw).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;

  const ymd = String(raw).match(/^\d{4}-\d{2}-\d{2}/);
  if (ymd) return String(raw).slice(0, 10);

  return new Date().toISOString().slice(0, 10);
}

function findColumn(headers, candidates) {
  for (const candidate of candidates) {
    const found = headers.find((header) => header.toLowerCase().trim() === candidate.toLowerCase());
    if (found) return found;
  }
  return null;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function inferPaymentMethod(statementType, description) {
  if (statementType === 'credit_card') return 'credit';

  const normalized = normalizeText(description);
  if (normalized.includes('pix')) return 'pix';
  if (normalized.includes('compra no debito')) return 'debit';
  if (normalized.includes('boleto')) return 'transfer';
  return 'other';
}

function inferCategory(description) {
  const normalized = normalizeText(description);
  if (normalized.includes('rdb') || normalized.includes('pagseguro') || normalized.includes('pagbank')) {
    return 'Investments';
  }
  if (normalized.includes('pagamento de fatura') || normalized.includes('pagamento recebido')) {
    return 'Transfer';
  }
  if (normalized.includes('youtube') || normalized.includes('openai') || normalized.includes('nucel') || normalized.includes('totalpass')) {
    return 'Subscriptions';
  }
  return 'Other';
}

export function parseNubankCSV(rows, { fileName = '' } = {}) {
  if (!rows || rows.length === 0) return [];

  const headers = Object.keys(rows[0]);
  const dateColumn = findColumn(headers, ['date', 'data']);
  const amountColumn = findColumn(headers, ['amount', 'valor']);
  const descriptionColumn = findColumn(headers, ['title', 'titulo', 'descrição', 'descriçao', 'description']);
  const identifierColumn = findColumn(headers, ['identificador', 'identifier', 'id']);
  const categoryColumn = findColumn(headers, ['category', 'categoria']);
  const statementType = identifierColumn ? 'account' : 'credit_card';

  return rows
    .filter((row) => {
      const amount = Number(String(row[amountColumn] || '0').replace(',', '.'));
      return Number.isFinite(amount) && amount !== 0;
    })
    .map((row, index) => {
      const rawAmount = Number(String(row[amountColumn] || '0').replace(',', '.'));
      const description = String(row[descriptionColumn] || row[identifierColumn] || 'Imported movement').trim();
      const type = statementType === 'account'
        ? (rawAmount > 0 ? 'income' : 'expense')
        : (rawAmount < 0 ? 'income' : 'expense');

      return {
        id: `row-${index + 1}`,
        type,
        date: parseDate(row[dateColumn]),
        description,
        amount: Math.abs(rawAmount),
        category: categoryColumn ? String(row[categoryColumn] || '').trim() || inferCategory(description) : inferCategory(description),
        raw_category: categoryColumn ? String(row[categoryColumn] || '').trim() : '',
        payment_method: inferPaymentMethod(statementType, description),
        recurrence: 'one-time',
        notes: '',
        statement_type: statementType,
        institution: 'Nubank',
        external_id: identifierColumn ? String(row[identifierColumn] || '').trim() : '',
        source_file: fileName,
      };
    });
}
