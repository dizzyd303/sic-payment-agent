import { db } from "../../db/init.js";
import { paypal } from "../../services/paypal/client.js";
import { decisionMatrix } from "../../core/decision-matrix.js";
import { llmComplete } from "../../services/llm/provider.js";
import crypto from "node:crypto";

export async function evaluatePayout(vendorName: string, amountCents: number, memo?: string) {
  const historyStmt = db.prepare("SELECT amount_cents FROM payouts WHERE vendor_name = ? AND status IN (?,?)");
  const history = await historyStmt.all(vendorName, "processing", "completed") as { amount_cents: number }[];
  const vendorKnown = history.length > 0;
  const avg = vendorKnown ? history.reduce((s, r) => s + r.amount_cents, 0) / history.length : amountCents;
  // Unknown vendor: NO history to compare against, so amountNormal is false.
  // Previously this was true, which handed unknown vendors the normal-amount bonus.
  const amountNormal = vendorKnown ? Math.abs(amountCents - avg) / avg < 0.5 : false;
  const amountDollars = (amountCents / 100).toFixed(2);
  const historicalAvgDollars = vendorKnown ? (avg / 100).toFixed(2) : null;
  const prompt = `You are a payment guard narrator.
Authoritative data:
vendor_name: ${vendorName}
amount_usd: $${amountDollars}
memo: ${memo ?? ""}
vendor_known: ${vendorKnown}
historical_avg_usd: ${historicalAvgDollars ?? "N/A"}
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
    module: "payment-guard",
    action: "payout",
    features: { vendorKnown, amountNormal, vendorName, amountCents, narration },
  });
  return { confidence: decision.confidence, threshold: decision.threshold, requiresApproval: decision.requiresApproval, decisionId: decision.decisionId, narration, vendorKnown, amountNormal };
}

function assertReceiver(receiver: string) {
  if (!receiver || !receiver.trim()) throw new Error("receiver_required: a real PayPal receiver is required; no placeholder is ever substituted");
  if (receiver.trim() === "acct@paypal.com") throw new Error("receiver_placeholder_rejected: placeholder receiver is not allowed");
}

export async function requestPayout(vendorName: string, receiver: string, amountCents: number, memo?: string) {
  assertReceiver(receiver);
  if (!amountCents || amountCents <= 0) throw new Error("amount_required");
  const evalRes = await evaluatePayout(vendorName, amountCents, memo);
  const id = crypto.randomUUID();
  const insertStmt = db.prepare(`INSERT INTO payouts (id, vendor_name, amount_cents, currency, status, confidence, requires_approval, notes, receiver, decision_id) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  await insertStmt.run(id, vendorName, amountCents, "USD", "pending", evalRes.confidence, evalRes.requiresApproval, memo ?? null, receiver, evalRes.decisionId);
  if (!evalRes.requiresApproval) {
    try {
      const batchId = `batch-${Date.now()}`;
      const batch = await paypal.createPayoutBatch(batchId, [{ receiver, amountCents, note: memo }]);
      const updateStmt = db.prepare("UPDATE payouts SET status=?, paypal_payout_batch_id=? WHERE id=?");
      await updateStmt.run("processing", batch.batch_header.payout_batch_id, id);
      // Batch acceptance is NOT payout success. Outcome is recorded only by
      // syncPayout() after PayPal reports a terminal batch status.
      return { id, autoApproved: true, batchId: batch.batch_header.payout_batch_id };
    } catch (e: any) {
      await db.prepare("UPDATE payouts SET status=? WHERE id=?").run("failed", id);
      if (evalRes.decisionId) await decisionMatrix.recordOutcome(evalRes.decisionId, "failure");
      throw e;
    }
  }
  return { id, autoApproved: false, requiresApproval: true };
}

// Approve the EXACT pending payout row by id. The receiver, amount and
// vendor are read from the stored row, never from a new caller-supplied set.
export async function approvePendingPayout(id: string, receiverOverride?: string) {
  const stmt = db.prepare("SELECT * FROM payouts WHERE id=?");
  const row = await stmt.get(id) as { receiver: string | null; amount_cents: number; notes: string | null; decision_id: string | null; status: string } | undefined;
  if (!row) throw Object.assign(new Error("not_found"), { statusCode: 404 });
  if (row.status !== "pending") throw Object.assign(new Error(`payout_not_pending: status is ${row.status}`), { statusCode: 409 });
  const receiver = (receiverOverride?.trim() || row.receiver || "").trim();
  assertReceiver(receiver);
  try {
    const batchId = `batch-${Date.now()}`;
    const batch = await paypal.createPayoutBatch(batchId, [{ receiver, amountCents: row.amount_cents, note: row.notes ?? "" }]);
    await db.prepare("UPDATE payouts SET status=?, paypal_payout_batch_id=?, requires_approval=FALSE, receiver=? WHERE id=?").run("processing", batch.batch_header.payout_batch_id, receiver, id);
    return { id, status: "processing", batchId: batch.batch_header.payout_batch_id, receiver, amount_cents: row.amount_cents };
  } catch (e: any) {
    await db.prepare("UPDATE payouts SET status=?, requires_approval=FALSE WHERE id=?").run("failed", id);
    if (row.decision_id) await decisionMatrix.recordOutcome(row.decision_id, "failure");
    throw e;
  }
}

// Poll PayPal for the batch status and only then record a terminal outcome.
export async function syncPayout(id: string) {
  const stmt = db.prepare("SELECT * FROM payouts WHERE id=?");
  const row = await stmt.get(id) as { paypal_payout_batch_id: string | null; decision_id: string | null; status: string } | undefined;
  if (!row) throw Object.assign(new Error("not_found"), { statusCode: 404 });
  if (!row.paypal_payout_batch_id) return { id, status: row.status, paypalStatus: null };
  const batch = await paypal.getPayoutBatch(row.paypal_payout_batch_id);
  const paypalStatus = batch.batch_header?.batch_status as string | undefined;
  if (paypalStatus === "SUCCESS") {
    await db.prepare("UPDATE payouts SET status=? WHERE id=?").run("completed", id);
    if (row.decision_id) await decisionMatrix.recordOutcome(row.decision_id, "success");
  } else if (["DENIED", "FAILED", "RETURNED"].includes(paypalStatus ?? "")) {
    await db.prepare("UPDATE payouts SET status=? WHERE id=?").run("failed", id);
    if (row.decision_id) await decisionMatrix.recordOutcome(row.decision_id, "failure");
  }
  const fresh = await stmt.get(id) as { status: string };
  return { id, status: fresh.status, paypalStatus: paypalStatus ?? null };
}
