import { Router } from 'express';
import { db } from '../../db/init.js';
import { evaluatePayout, requestPayout } from './service.js';
import { paypal } from '../../services/paypal/client.js';
import { decisionMatrix } from '../../core/decision-matrix.js';
export const paymentGuardRouter = Router();

paymentGuardRouter.post('/evaluate', async (req,res)=> {
  const { vendor_name, amount, memo } = req.body;
  res.json(await evaluatePayout(vendor_name, amount, memo));
});

paymentGuardRouter.post('/request', async (req,res)=> {
  const { vendor_name, receiver, amount, memo } = req.body;
  res.json(await requestPayout(vendor_name, receiver, amount, memo));
});

paymentGuardRouter.get('/pending', async (_,res)=> {
  const stmt = db.prepare("SELECT * FROM payouts WHERE requires_approval=1 AND status='pending'");
  const rows = await stmt.all();
  res.json(rows);
});

paymentGuardRouter.post('/approve/:id', async (req,res)=> {
  const { id } = req.params;
  const stmt = db.prepare('SELECT * FROM payouts WHERE id=?');
  const row = await stmt.get(id) as { receiver: string; amount_cents: number; notes: string | null; decision_id: string | null } | undefined;
  if (!row) return res.status(404).json({error:'not found'});
  try {
    const batchId = `batch-${Date.now()}`;
    const batch = await paypal.createPayoutBatch(batchId, [{receiver: row.receiver, amountCents: row.amount_cents, note: row.notes ?? ''}]);
    const updateStmt = db.prepare('UPDATE payouts SET status=?, paypal_payout_batch_id=?, requires_approval=0 WHERE id=?');
    await updateStmt.run('processing', batch.batch_header.payout_batch_id, id);
    if (row.decision_id) await decisionMatrix.recordOutcome(row.decision_id, 'success');
    res.json({ id, status:'processing', batchId: batch.batch_header.payout_batch_id });
  } catch (e:any) {
    const failStmt = db.prepare('UPDATE payouts SET status=?, requires_approval=0 WHERE id=?');
    await failStmt.run('failed', id);
    res.status(422).json({ error: 'payout_failed', message: e?.response?.data?.message || e.message || 'PayPal error', code: e?.response?.data?.name || 'UNKNOWN' });
  }
});

paymentGuardRouter.post('/reject/:id', async (req,res)=> {
  const { id } = req.params;
  const stmt = db.prepare('SELECT * FROM payouts WHERE id=?');
  const row = await stmt.get(id) as { decision_id: string | null } | undefined;
  if (row && row.decision_id) {
    await decisionMatrix.recordOutcome(row.decision_id, 'escalated');
  }
  const rejectStmt = db.prepare("UPDATE payouts SET status='rejected', requires_approval=0 WHERE id=?");
  await rejectStmt.run(id);
  res.json({ id, status:'rejected' });
});