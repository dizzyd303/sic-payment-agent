import { db } from '../../db/init.js';
import { paypal } from '../../services/paypal/client.js';
import { decisionMatrix } from '../../core/decision-matrix.js';
import { llmComplete } from '../../services/llm/provider.js';
import { tavilySearch } from '../../services/tavily/client.js';
import crypto from 'node:crypto';

export async function createReceivable(customerName: string, amountCents: number, currency='USD', dueDate?: string, notes?: string) {
  const id = crypto.randomUUID();
  const order = await paypal.createOrder(amountCents, currency);
  const stmt = db.prepare(`INSERT INTO receivables (id, customer_name, amount_cents, currency, due_date, status, paypal_order_id, notes) VALUES (?,?,?,?,?,?,?,?)`);
  await stmt.run(id, customerName, amountCents, currency, dueDate ?? null, 'open', order.id, notes ?? null);
  return { id, paypalOrderId: order.id, link: order.links?.find((l: any) => l.rel === 'approve')?.href };
}

export async function chaseReceivable(id: string) {
  console.log('[Receivables] chaseReceivable entry', { id });
  const rowStmt = db.prepare('SELECT * FROM receivables WHERE id = ?');
  const row = await rowStmt.get(id) as { due_date: string | null; amount_cents: number; customer_name: string; notes: string | null } | undefined;
  if (!row) throw new Error('Not found');
  const daysOverdue = row.due_date ? Math.max(0, Math.floor((Date.now() - new Date(row.due_date).getTime())/86400000)) : 0;
  const priorChaseStmt = db.prepare('SELECT COUNT(*) as c FROM chase_log WHERE receivable_id = ?');
  const priorChaseResult = await priorChaseStmt.get(id) as { c: number } | undefined;
  const priorChaseSuccess = (priorChaseResult?.c ?? 0) > 0;
  const decision = await decisionMatrix.decide({
    module: 'receivables',
    action: 'chase',
    features: { daysOverdue, amount: row.amount_cents, customerName: row.customer_name, priorChaseSuccess, neverPays: false }
  });
  console.log('[Receivables] decision', { decisionId: decision.decisionId, confidence: decision.confidence, requiresApproval: decision.requiresApproval });
  if (decision.requiresApproval) {
    return { decisionId: decision.decisionId, chased: false, reason: 'low confidence' };
  }
  // LLM only after decision passes
  console.log('[Receivables] draft start', { customer: row.customer_name });
  const search = await tavilySearch(`${row.customer_name} business contact`);
  const tavilyContext = search.map((s: any) => s.content).join(' ');
  const prompt = `You are drafting an overdue invoice chase email.
Ledger authoritative fields - do NOT override:
customer_name: ${row.customer_name}
receivable_id: ${id}
amount: $${(row.amount_cents/100).toFixed(2)}
days_overdue: ${daysOverdue}
shop_name: ${row.notes?.split('|')[0] ?? row.customer_name}

Tavily context for background only: "${tavilyContext.slice(0,500)}"
If Tavily context conflicts with ledger fields, flag the conflict explicitly and keep ledger values.

Requirements:
- Use exact customer_name and receivable_id from ledger, no placeholders like [Name] or [ID]
- Sign off with shop name from ledger
- Polite, human tone
- No bracket placeholders
Output only the email body.`;
  const { text: message } = await llmComplete(prompt);
  console.log('[Receivables] draft complete', { messageLength: message.length });
  const chaseStmt = db.prepare('INSERT INTO chase_log (receivable_id, channel) VALUES (?,?)');
  await chaseStmt.run(id, 'agent');
  await decisionMatrix.recordOutcome(decision.decisionId, 'success');
  return { decisionId: decision.decisionId, chased: true, message };
}

export async function listReceivables(status?: string) {
  const q = status ? 'SELECT * FROM receivables WHERE status = ?' : 'SELECT * FROM receivables';
  const stmt = db.prepare(q);
  return status ? await stmt.all(status) : await stmt.all();
}