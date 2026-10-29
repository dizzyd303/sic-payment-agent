import { db } from '../../db/init.js';
import { paypal } from '../../services/paypal/client.js';
import { decisionMatrix } from '../../core/decision-matrix.js';
import { llmComplete } from '../../services/llm/provider.js';
import crypto from 'node:crypto';

export async function evaluatePayout(vendorName:string, amountCents:number, memo?:string) {
  const historyStmt = db.prepare("SELECT amount_cents FROM payouts WHERE vendor_name = ? AND status IN ('processing','completed')");
  const history = await historyStmt.all(vendorName) as { amount_cents: number }[];
  const vendorKnown = history.length > 0;
  const avg = vendorKnown ? history.reduce((s,r)=>s+r.amount_cents,0)/history.length : amountCents;
  const amountNormal = vendorKnown ? Math.abs(amountCents - avg)/avg < 0.5 : true;
  const amountDollars = (amountCents/100).toFixed(2);
  const historicalAvgDollars = vendorKnown ? (avg/100).toFixed(2) : null;
  const prompt = `You are a payment guard narrator.
Authoritative data:
vendor_name: ${vendorName}
amount_usd: $${amountDollars}
memo: ${memo ?? ''}
vendor_known: ${vendorKnown}
historical_avg_usd: ${historicalAvgDollars ?? 'N/A'}
amount_normal: ${amountNormal}

Task: Explain in plain language why this payout might be unusual or normal.
Rules:
- Express amounts in dollars, e.g. $210.00, never in cents.
- If vendor_known is false, do NOT claim the amount is normal or matches history. State explicitly there is no history to compare against and that is a risk signal.
- If vendor_known is true, compare amount_usd to historical_avg_usd.
- No placeholders like [Name] or [Amount]. Reference exact vendor name and dollar amount.
- Output 1-3 short sentences.`;
  const { text: narration } = await llmComplete(prompt);
  const decision = await decisionMatrix.decide({
    module: 'payment-guard',
    action: 'payout',
    features: { vendorKnown, amountNormal, vendorName, amountCents, narration }
  });
  return { confidence: decision.confidence, threshold: decision.threshold, requiresApproval: decision.requiresApproval, decisionId: decision.decisionId, narration, vendorKnown, amountNormal };
}

export async function requestPayout(vendorName:string, receiver:string, amountCents:number, memo?:string) {
  const evalRes = await evaluatePayout(vendorName, amountCents, memo);
  const id = crypto.randomUUID();
  const insertStmt = db.prepare(`INSERT INTO payouts (id, vendor_name, amount_cents, currency, status, confidence, requires_approval, notes, receiver, decision_id) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  await insertStmt.run(id, vendorName, amountCents, 'USD', 'pending', evalRes.confidence, evalRes.requiresApproval?1:0, memo??null, receiver, evalRes.decisionId);
  if (!evalRes.requiresApproval) {
    const batchId = `batch-${Date.now()}`;
    const batch = await paypal.createPayoutBatch(batchId, [{receiver, amountCents, note: memo}]);
    const updateStmt = db.prepare('UPDATE payouts SET status=?, paypal_payout_batch_id=? WHERE id=?');
    await updateStmt.run('processing', batch.batch_header.payout_batch_id, id);
    await decisionMatrix.recordOutcome(evalRes.decisionId, 'success');
    return { id, autoApproved: true, batchId: batch.batch_header.payout_batch_id };
  }
  return { id, autoApproved: false, requiresApproval: true };
}