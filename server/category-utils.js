function stripMarks(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function normalizeCategoryText(value) {
  return stripMarks(String(value || ''))
    .toLowerCase()
    .replace(/\b\d{2,}\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesAny(text, patterns) {
  return patterns.some((pattern) => text.includes(pattern));
}

const EXACT_CATEGORY_RULES = [
  {
    category: 'Housing',
    confidence: 98,
    reason: 'Home or mattress store pattern detected.',
    patterns: ['exclusiva colchoes'],
  },
  {
    category: 'Transport',
    confidence: 97,
    reason: 'Fuel or auto insurance pattern detected.',
    patterns: ['auto posto muffato', 'tokio marine', 'estacenter'],
  },
  {
    category: 'Health',
    confidence: 97,
    reason: 'Health or pharmacy provider detected.',
    patterns: ['pharmadelle'],
  },
  {
    category: 'Shopping',
    confidence: 96,
    reason: 'Retail or marketplace purchase detected.',
    patterns: ['amazon br', 'piedade card house', 'fabiwan coml de materi'],
  },
  {
    category: 'Entertainment',
    confidence: 96,
    reason: 'Cinema, ticketing or leisure purchase detected.',
    patterns: ['q2 ingressos', 'cinemark londrina', 'jk londrina', 'londrina jk'],
  },
  {
    category: 'Subscriptions',
    confidence: 96,
    reason: 'Recurring digital service pattern detected.',
    patterns: ['openai', 'youtube', 'nucel', 'totalpass', 'dl google'],
  },
  {
    category: 'Food',
    confidence: 95,
    reason: 'Restaurant, convenience or food merchant detected.',
    patterns: [
      'anota ai',
      'mesconvenienciae',
      'cantina caprichosa',
      'pizzaria fiorella',
      'mercadinho',
      'assai atacadista',
      'hachimitsu',
      'gracco burguer',
      'pastel do adelino',
      'bodega paranagua',
      'wari produtos alimenti',
      'yuanping restaurantes',
      'acai brazil',
      'mimy otake uchiashi',
      'restaurante minerin',
      'lai chi',
      'dog chicken',
      'rolls foods',
      'mae gaia granolas',
      'pigui foods',
      'seraffins restaurante',
      'the best aca',
      'arabis',
    ],
  },
  {
    category: 'Health',
    confidence: 88,
    reason: 'Wellness provider name detected, but it should stay reviewable.',
    patterns: ['vidamax'],
  },
  {
    category: 'Transport',
    confidence: 84,
    reason: 'Garage merchant detected, but it may still need your confirmation.',
    patterns: ['tubarao garage'],
  },
];

const KEYWORD_CATEGORY_RULES = [
  {
    category: 'Subscriptions',
    confidence: 90,
    reason: 'Digital subscription keyword detected.',
    patterns: ['spotify', 'netflix', 'openai', 'youtube', 'google', 'icloud', 'adobe', 'canva'],
  },
  {
    category: 'Food',
    confidence: 90,
    reason: 'Food or restaurant keyword detected.',
    patterns: ['restaurante', 'burger', 'burguer', 'pizza', 'pizzaria', 'pastel', 'acai', 'mercad', 'food', 'cantina'],
  },
  {
    category: 'Transport',
    confidence: 89,
    reason: 'Transport, fuel or automotive keyword detected.',
    patterns: ['auto posto', 'posto', 'combust', 'uber', '99', 'garage', 'marine auto', 'estacionamento'],
  },
  {
    category: 'Health',
    confidence: 88,
    reason: 'Health or pharmacy keyword detected.',
    patterns: ['pharma', 'farm', 'droga', 'saude', 'vida', 'clinic', 'hospital', 'odonto'],
  },
  {
    category: 'Housing',
    confidence: 88,
    reason: 'Home or household keyword detected.',
    patterns: ['colch', 'casa', 'home', 'move', 'imovel', 'condominio', 'energia', 'sanepar'],
  },
  {
    category: 'Shopping',
    confidence: 86,
    reason: 'Retail keyword detected.',
    patterns: ['amazon', 'mercado livre', 'shopping', 'store', 'shop', 'materi', 'card house'],
  },
  {
    category: 'Entertainment',
    confidence: 86,
    reason: 'Leisure or ticket keyword detected.',
    patterns: ['ingresso', 'cinemark', 'cinema', 'show', 'ticket', 'jk'],
  },
];

export function inferCategoryHint({
  description = '',
  cleanedDescription = '',
  normalizedDescription = '',
  currentCategory = '',
} = {}) {
  const lockedCategory = String(currentCategory || '').trim();
  if (lockedCategory && !['Other', 'Transfer'].includes(lockedCategory)) {
    return {
      category: lockedCategory,
      confidence: 100,
      reason: 'Existing category already carries explicit meaning.',
    };
  }

  const normalized = normalizedDescription
    ? normalizeCategoryText(normalizedDescription)
    : normalizeCategoryText(cleanedDescription || description);

  if (!normalized) {
    return null;
  }

  for (const rule of EXACT_CATEGORY_RULES) {
    if (includesAny(normalized, rule.patterns)) {
      return {
        category: rule.category,
        confidence: rule.confidence,
        reason: rule.reason,
      };
    }
  }

  for (const rule of KEYWORD_CATEGORY_RULES) {
    if (includesAny(normalized, rule.patterns)) {
      return {
        category: rule.category,
        confidence: rule.confidence,
        reason: rule.reason,
      };
    }
  }

  return null;
}
