import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { paymentGuardRouter } from './modules/payment-guard/routes.js';
import { conversationalRouter } from './modules/conversational/routes.js';
import { initDatabase } from './db/init.js';
import { db } from './db/init.js';
import { requireAdminForMutations } from './middleware/auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const corsOrigin = process.env.CORS_ORIGIN;
if (corsOrigin) { app.use((req, res, next) => { res.setHeader('Access-Control-Allow-Origin', corsOrigin); res.setHeader('Vary', 'Origin'); next(); }); }
app.use('/api', requireAdminForMutations);
app.use(express.json());

await initDatabase();

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
  const lastFailed = await lastFailedStmt.get() as { id: string; vendor_name: string; amount_cents: number; created_at: string } | undefined;
  res.json({
    healthy: Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
    paypalConfigured: Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
    failedCount: failed?.c ?? 0,
    lastFailed: lastFailed ? { id: lastFailed.id, vendor_name: lastFailed.vendor_name, amount_cents: lastFailed.amount_cents, created_at: lastFailed.created_at } : null,
  });
});

app.use('/api/guard', paymentGuardRouter);
app.use('/api/chat', conversationalRouter);

// Serve UI
app.use(express.static(path.join(__dirname, '../public')));

const port = process.env.PORT ?? 8080;
app.listen(port, () => console.log(`SIC Payment Agent listening on ${port}`));
