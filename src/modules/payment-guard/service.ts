import { db } from "../../db/init.js";
import { paypal } from "../../services/paypal/client.js";
import { decisionMatrix } from "../../core/decision-matrix.js";
import { llmComplete } from "../../services/llm/provider.js";
import crypto from "node:crypto";

// Amounts are integer cents, capped at $10,000 unless MAX_PAYOUT_CENTS is set.
export const MAX_PAYOUT_CENTS = (() => {
  const parsed = Number(process.env.MAX_PAYOUT_CENTS);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1_000_000;
})();

export function validateAmountCents(amountCents: unknown): number {
  if (typeof amountCents !== "number" || !Number.isInteger(amountCents)) {
    throw Object.assign(new Error("amount_invalid: amount must be integer cents"), { statusCode: 422 });
  }
  if (amountCents <= 0) {
    throw Object.assign(new Error("amount_required"), { statusCode: 422 });
  }
  if (amountCents > MAX_PAYOUT_CENTS) {
    throw Object.assign(new Error(`amount_too_large: amount exceeds ${MAX_PAYOUT_CENTS} cents`), { statusCode: 422 });
  }
  return amountCents;
}

export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// A vendor counts as known after 3 completed payouts.
export const MIN_KNOWN_HISTORY = 3;

export async function evaluatePayout(vendorName: string, amountCents: number, memo?: string) {
  validateAmountCents(amountCents);
  const normalizedVendor = vendorName?.toString().trim().toLowerCase() ?? "";
  if (!normalizedVendor) throw Object.assign(new Error("vendor_required"), { statusCode: 422 });
  // Only completed payouts count as history.
  const historyStmt = db.prepare("SELECT amount_cents FROM payouts WHERE LOWER(vendor_name) = ? AND status = ?");
  const history = await historyStmt.all(normalizedVendor, "completed") as { amount_cents: number }[];
  const historyCount = history.length;
  const vendorKnown = historyCount >= MIN_KNOWN_HISTORY;
  const med = vendorKnown ? median(history.map((r) => r.amount_cents)) : amountCents;
  // No known history, so amountNormal is false.
  const amountNormal = vendorKnown ? Math.abs(amountCents - med) / med < 0.5 : false;
  const amountDollars = (amountCents / 100).toFixed(2);
  const historicalMedianDollars = vendorKnown ? (med / 100).toFixed(2) : null;
  // Memo is not sent to the LLM prompt.
  const prompt = `You are a payment guard narrator.
Authoritative data:
vendor_name: ${vendorName}
amount_usd: $${amountDollars}
vendor_known: ${vendorKnown}
completed_history_count: ${historyCount}
historical_median_usd: ${historicalMedianDollars ?? "N/A"}
amount_normal: ${amountNormal}

Task: Explain in plain language why this payout might be unusual or normal.
Rules:
- Express amounts in dollars, e.g. $210.00, never in cents.
- If vendor_known is false, do NOT claim the amount is normal or matches history. State explicitly there is no sufficient history to compare against and that is a risk signal.
- If vendor_known is true, compare amount_usd to historical_median_usd.
- No placeholders like [Name] or [Amount]. Reference exact vendor name and dollar amount.
- Output 1-3 short sentences.`;
  const { text: narration } = await llmComplete(prompt);
  const decision = await decisionMatrix.decide({
    module: "payment-guard",
    action: "payout",
    features: { vendorKnown, amountNormal, vendorName, amountCents, historyCount, historicalMedianCents: vendorKnown ? med : 0 },
  });
  return { confidence: decision.confidence, threshold: decision.threshold, requiresApproval: decision.requiresApproval, decisionId: decision.decisionId, narration, vendorKnown, amountNormal, historyCount, reasons: decision.reasons };
}

function assertReceiver(receiver: string) {
  if (!receiver || !receiver.trim()) throw new Error("receiver_required: a real PayPal receiver is required; no placeholder is ever substituted");
  if (receiver.trim() === "acct@paypal.com") throw new Error("receiver_placeholder_rejected: placeholder receiver is not allowed");
}

// One conditional UPDATE claims a pending row. The loser gets 409.
type PayoutRow = {
  id: string; vendor_name: string; receiver: string | null; amount_cents: number;
  currency: string; notes: string | null; decision_id: string | null; status: string;
};

export async function claimPendingPayout(id: string): Promise<PayoutRow> {
  const row = await db.prepare("SELECT * FROM payouts WHERE id=?").get(id) as PayoutRow | undefined;
  if (!row) throw Object.assign(new Error("not_found"), { statusCode: 404 });
  if (row.status !== "pending") throw Object.assign(new Error(`payout_not_pending: status is ${row.status}`), { statusCode: 409 });
  const claimed = await db.prepare("UPDATE payouts SET status=?, requires_approval=FALSE WHERE id=? AND status=?").run("approving", id, "pending");
  if (claimed.changes === 0) {
    // Someone else claimed it first.
    const fresh = await db.prepare("SELECT * FROM payouts WHERE id=?").get(id) as PayoutRow | undefined;
    throw Object.assign(new Error(`payout_not_pending: status is ${fresh?.status ?? "unknown"}`), { statusCode: 409 });
  }
  return { ...row, status: "approving" };
}

export async function requestPayout(vendorName: string, receiver: string, amountCents: number, memo?: string) {
  assertReceiver(receiver);
  validateAmountCents(amountCents);
  const evalRes = await evaluatePayout(vendorName, amountCents, memo);
  const id = crypto.randomUUID();
  const insertStmt = db.prepare(`INSERT INTO payouts (id, vendor_name, amount_cents, currency, status, confidence, requires_approval, notes, receiver, decision_id) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  await insertStmt.run(id, vendorName, amountCents, "USD", "pending", evalRes.confidence, evalRes.requiresApproval, memo ?? null, receiver, evalRes.decisionId);
  if (!evalRes.requiresApproval) {
    // Claim it here too, so a manual approve can't double-pay it.
    try {
      await claimPendingPayout(id);
    } catch {
      return { id, autoApproved: false, requiresApproval: true };
    }
    try {
      // Same batch id on retry, so a retry doesn't make a second batch.
      const batchId = `payout-${id}`;
      const batch = await paypal.createPayoutBatch(batchId, [{ receiver, amountCents, note: memo }]);
      await db.prepare("UPDATE payouts SET status=?, paypal_payout_batch_id=? WHERE id=? AND status=?").run("processing", batch.batch_header.payout_batch_id, id, "approving");
      // Batch acceptance is not success. Sync records the outcome later.
      return { id, autoApproved: true, batchId: batch.batch_header.payout_batch_id };
    } catch (e: any) {
      await db.prepare("UPDATE payouts SET status=? WHERE id=? AND status=?").run("failed", id, "approving");
      if (evalRes.decisionId) await decisionMatrix.recordOutcome(evalRes.decisionId, "failure");
      throw e;
    }
  }
  return { id, autoApproved: false, requiresApproval: true };
}

// Approve only the stored row. A supplied receiver only fills an empty one; a different one is rejected.
export async function approvePendingPayout(id: string, receiverOverride?: string) {
  const row = await claimPendingPayout(id);
  const supplied = receiverOverride?.trim();
  if (row.receiver && supplied && supplied !== row.receiver.trim()) {
    // Put it back to pending so it can still be approved as stored.
    await db.prepare("UPDATE payouts SET status=?, requires_approval=TRUE WHERE id=? AND status=?").run("pending", id, "approving");
    throw Object.assign(new Error("receiver_mismatch: approval is bound to the stored receiver; a changed receiver needs a fresh payout and evaluation"), { statusCode: 409 });
  }
  const receiver = (supplied || row.receiver || "").trim();
  try {
    assertReceiver(receiver);
  } catch (e: any) {
    await db.prepare("UPDATE payouts SET status=?, requires_approval=TRUE WHERE id=? AND status=?").run("pending", id, "approving");
    throw e;
  }
  try {
    const batchId = `payout-${id}`;
    const batch = await paypal.createPayoutBatch(batchId, [{ receiver, amountCents: row.amount_cents, note: row.notes ?? "" }]);
    await db.prepare("UPDATE payouts SET status=?, paypal_payout_batch_id=?, requires_approval=FALSE, receiver=? WHERE id=? AND status=?").run("processing", batch.batch_header.payout_batch_id, receiver, id, "approving");
    return { id, status: "processing", batchId: batch.batch_header.payout_batch_id, receiver, amount_cents: row.amount_cents, currency: row.currency };
  } catch (e: any) {
    await db.prepare("UPDATE payouts SET status=?, requires_approval=FALSE WHERE id=? AND status=?").run("failed", id, "approving");
    if (row.decision_id) await decisionMatrix.recordOutcome(row.decision_id, "failure");
    throw e;
  }
}

// Sync records an outcome only on a terminal PayPal status, and only once.
const TERMINAL_STATUSES = ["completed", "failed", "rejected"];
export async function syncPayout(id: string) {
  const stmt = db.prepare("SELECT * FROM payouts WHERE id=?");
  const row = await stmt.get(id) as { paypal_payout_batch_id: string | null; decision_id: string | null; status: string } | undefined;
  if (!row) throw Object.assign(new Error("not_found"), { statusCode: 404 });
  if (TERMINAL_STATUSES.includes(row.status)) {
    return { id, status: row.status, paypalStatus: null };
  }
  if (row.status === "approving") {
    // Approval still in flight, no batch yet, nothing to record.
    return { id, status: row.status, paypalStatus: null };
  }
  if (!row.paypal_payout_batch_id) return { id, status: row.status, paypalStatus: null };
  const batch = await paypal.getPayoutBatch(row.paypal_payout_batch_id);
  const paypalStatus = batch.batch_header?.batch_status as string | undefined;
  if (paypalStatus === "SUCCESS") {
    const moved = await db.prepare("UPDATE payouts SET status=? WHERE id=? AND status NOT IN (?,?,?)").run("completed", id, "completed", "failed", "rejected");
    if (moved.changes > 0 && row.decision_id) await decisionMatrix.recordOutcome(row.decision_id, "success");
  } else if (["DENIED", "FAILED", "RETURNED"].includes(paypalStatus ?? "")) {
    const moved = await db.prepare("UPDATE payouts SET status=? WHERE id=? AND status NOT IN (?,?,?)").run("failed", id, "completed", "failed", "rejected");
    if (moved.changes > 0 && row.decision_id) await decisionMatrix.recordOutcome(row.decision_id, "failure");
  }
  const fresh = await stmt.get(id) as { status: string };
  return { id, status: fresh.status, paypalStatus: paypalStatus ?? null };
}
