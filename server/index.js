import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { initDB } from './db.js';

dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env') });

const app = express();
const PORT = process.env.PORT || 3001;

app.use((req, res, next) => { console.log(`[REQ] ${req.method} ${req.url}`); next(); });
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:5174'] }));
app.use(express.json({ limit: '10mb' }));

// Initialize DB then start server
initDB().then(async () => {
  const { default: incomeRoutes } = await import('./routes/income.js');
  const { default: expensesRoutes } = await import('./routes/expenses.js');
  const { default: subscriptionsRoutes } = await import('./routes/subscriptions.js');
  const { default: goalsRoutes } = await import('./routes/goals.js');
  const { default: settingsRoutes } = await import('./routes/settings.js');
  const { default: aiRoutes } = await import('./routes/ai.js');

  app.use('/api/income', incomeRoutes);
  app.use('/api/expenses', expensesRoutes);
  app.use('/api/subscriptions', subscriptionsRoutes);
  app.use('/api/goals', goalsRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/ai', aiRoutes);

  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.post('/api/test', (req, res) => {
    res.json({ status: 'direct test ok' });
  });

  app.listen(PORT, () => {
    console.log(`\n🚀 Finance API running on http://localhost:${PORT}`);
    console.log(`   Gemini key: ${process.env.GEMINI_API_KEY ? '✅ loaded' : '⚠️  not set — add GEMINI_API_KEY to .env'}\n`);
  });
}).catch(err => {
  console.error('Failed to initialize DB:', err);
  process.exit(1);
});
