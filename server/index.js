import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { initDB } from './db.js';
import {
  APP_REQUEST_HEADER,
  APP_REQUEST_HEADER_VALUE,
  RESET_CONFIRMATION_HEADER,
} from './validation.js';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });

const app = express();
const PORT = process.env.PORT || 3001;
const ALLOWED_ORIGINS = new Set(['http://localhost:5173', 'http://localhost:5174']);
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

app.disable('x-powered-by');

app.use((req, res, next) => {
  console.log(`[REQ] ${req.method} ${req.path}`);
  next();
});

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  next();
});

app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || ALLOWED_ORIGINS.has(origin));
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', APP_REQUEST_HEADER, RESET_CONFIRMATION_HEADER],
  maxAge: 600,
}));

app.use(express.json({ limit: '2mb' }));

app.use('/api', (req, res, next) => {
  const origin = req.get('origin');

  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  if (MUTATING_METHODS.has(req.method) && req.get(APP_REQUEST_HEADER) !== APP_REQUEST_HEADER_VALUE) {
    return res.status(403).json({ error: 'Missing application request header' });
  }

  return next();
});

// Initialize DB then start server
initDB().then(async () => {
  const { default: incomeRoutes } = await import('./routes/income.js');
  const { default: expensesRoutes } = await import('./routes/expenses.js');
  const { default: subscriptionsRoutes } = await import('./routes/subscriptions.js');
  const { default: goalsRoutes } = await import('./routes/goals.js');
  const { default: settingsRoutes } = await import('./routes/settings.js');
  const { default: aiRoutes } = await import('./routes/ai.js');
  const { default: accountsRoutes } = await import('./routes/accounts.js');

  app.use('/api/income', incomeRoutes);
  app.use('/api/expenses', expensesRoutes);
  app.use('/api/subscriptions', subscriptionsRoutes);
  app.use('/api/goals', goalsRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/ai', aiRoutes);
  app.use('/api/accounts', accountsRoutes);

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use((req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });

  app.use((err, req, res, next) => {
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Request body too large' });
    }

    if (err instanceof SyntaxError && Object.prototype.hasOwnProperty.call(err, 'body')) {
      return res.status(400).json({ error: 'Invalid JSON body' });
    }

    console.error('Unhandled API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  });

  app.listen(PORT, () => {
    console.log(`\n🚀 Finance API running on http://localhost:${PORT}`);
    console.log(`   Gemini key: ${process.env.GEMINI_API_KEY ? '✅ loaded' : '⚠️  not set — add GEMINI_API_KEY to .env'}\n`);
  });
}).catch(err => {
  console.error('Failed to initialize DB:', err);
  process.exit(1);
});
