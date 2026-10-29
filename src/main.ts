import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { receivablesRouter } from './modules/receivables/routes.js';
import { paymentGuardRouter } from './modules/payment-guard/routes.js';
import { conversationalRouter } from './modules/conversational/routes.js';
import { initDatabase } from './db/init.js';
import { db } from './db/init.js';
import { initializePayPalAgent } from './services/paypal/agent-toolkit.js';
import { agentRouter } from './modules/agent/routes.js';
import { invoicesRouter } from './modules/invoices/routes.js';
import { subscriptionsRouter } from './modules/subscriptions/routes.js';
import { productsRouter } from './modules/products/routes.js';
import { mcpRouter } from './modules/mcp/routes.js';
import { apimaticRouter } from './modules/apimatic/routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

await initDatabase();

// Initialize PayPal Agent Toolkit
const paypalConfig = {
  clientId: process.env.PAYPAL_CLIENT_ID ?? '',
  clientSecret: process.env.PAYPAL_CLIENT_SECRET ?? '',
  environment: (process.env.PAYPAL_MODE as 'sandbox' | 'production') ?? 'sandbox',
};

if (paypalConfig.clientId && paypalConfig.clientSecret) {
  initializePayPalAgent(paypalConfig);
  console.log('[PayPal Agent] Initialized successfully');
} else {
  console.warn('[PayPal Agent] Credentials not configured - agent features disabled');
}

app.get('/health', (_, res) => res.json({ ok: true }));
app.get('/api/decisions', async (_, res) => {
  const stmt = db.prepare(`
    SELECT d.*, o.outcome
    FROM decisions d
    LEFT JOIN outcomes o ON o.decision_id = d.id
    ORDER BY d.created_at DESC
    LIMIT 200
  `);
  const rows = await stmt.all();
  res.json(rows);
});
app.get('/api/paypal/status', async (_, res) => {
  const failedStmt = db.prepare("SELECT COUNT(*) as c FROM payouts WHERE status='failed'");
  const failed = await failedStmt.get() as { c: number } | undefined;
  const lastFailedStmt = db.prepare("SELECT * FROM payouts WHERE status='failed' ORDER BY created_at DESC LIMIT 1");
  const lastFailed = await lastFailedStmt.get() as { id: string } | undefined;
  res.json({ healthy: (failed?.c ?? 0) === 0, failedCount: failed?.c ?? 0, lastError: lastFailed ? { id: lastFailed.id, code: 'INSUFFICIENT_FUNDS', message: 'PayPal sandbox dry' } : null });
});

app.use('/api/receivables', receivablesRouter);
app.use('/api/guard', paymentGuardRouter);
app.use('/api/chat', conversationalRouter);
app.use('/api/agent', agentRouter);
app.use('/api/invoices', invoicesRouter);
app.use('/api/subscriptions', subscriptionsRouter);
app.use('/api/products', productsRouter);
app.use('/api/mcp', mcpRouter);
app.use('/api/apimatic', apimaticRouter);

// Serve UI
app.use(express.static(path.join(__dirname, '../public')));

const port = process.env.PORT ?? 8080;
app.listen(port, () => console.log(`SIC Payment Agent listening on ${port}`));
