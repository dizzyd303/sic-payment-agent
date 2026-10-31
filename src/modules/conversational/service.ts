import { decisionMatrix } from "../../core/decision-matrix.js";
import { llmComplete } from "../../services/llm/provider.js";
import { db } from "../../db/init.js";
import crypto from "node:crypto";

function extractEmail(message: string): string | null {
  const m = message.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  return m ? m[0] : null;
}

export async function handleMessage(message: string) {
  const hasPaymentKeyword = /\b(pay|send|transfer|payout)\b/i.test(message) && /\$?\d/.test(message);
  const parsePrompt = `Extract vendor name and amount in cents from: "${message}". Return JSON {vendor, amount_cents, confidence}.`;
  const { text } = await llmComplete(parsePrompt);
  let intent;
  try { intent = JSON.parse(text); } catch { intent = parseIntent(message); }
  const amountCents = intent.amount_cents ?? intent.amount ?? 0;
  const vendor = (intent.vendor || "").toString().trim().toLowerCase();
  const parseConf = intent.confidence ?? 0.3;
  // No pending row is created for a non-integer, non-positive, or
  // over-cap amount: the same server-side cap as the guard path applies
  // here ($10,000 / 1,000,000 cents by default, MAX_PAYOUT_CENTS override).
  const maxCents = (() => { const p = Number(process.env.MAX_PAYOUT_CENTS); return Number.isInteger(p) && p > 0 ? p : 1_000_000; })();
  const parseFailed = !hasPaymentKeyword || vendor === "unknown" || !vendor || !Number.isInteger(amountCents) || amountCents <= 0 || amountCents > maxCents;
  if (parseFailed) {
    const conversationalReply = `I\u2019m SIC Payment Agent, your PayPal-native payment assistant. I can:\n\u2022 Track receivables and chase overdue invoices\n\u2022 Guard outgoing payouts with confidence scoring and approval workflows\n\u2022 Move money conversationally, e.g. "pay the plumber $200"\nTry asking about a specific task, or say "pay <vendor> $<amount>" to start a payment.`;
    return { reply: conversationalReply, decisionId: null, confidence: 0, requiresApproval: false, parseFailed: true };
  }
  const receiver = extractEmail(message);
  const decision = await decisionMatrix.decide({
    module: "conversational",
    action: "pay",
    features: { vendor, amount: amountCents, parseConfidence: parseConf },
  });
  // Persist the EXACT pending transaction. Chat confirm can only approve
  // this row, with its stored vendor/amount, and a real receiver.
  const pendingId = crypto.randomUUID();
  await db.prepare(`INSERT INTO payouts (id, vendor_name, amount_cents, currency, status, confidence, requires_approval, notes, receiver, decision_id) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(pendingId, vendor, amountCents, "USD", "pending", decision.confidence, 1, "Chat pending", receiver, decision.decisionId);
  const dollars = (amountCents / 100).toFixed(2);
  const reply = receiver
    ? `Pending: pay ${vendor} $${dollars} to ${receiver}. Confirm to send exactly that \u2014 no payment has been sent yet.`
    : `Pending: pay ${vendor} $${dollars}. I still need the PayPal email for ${vendor} before anything can move \u2014 no payment has been sent, and no placeholder receiver will be used.`;
  return { reply, decisionId: decision.decisionId, pendingId, vendor, amount_cents: amountCents, receiver, needsReceiver: !receiver, confidence: decision.confidence, requiresApproval: true };
}

function parseIntent(msg: string) {
  const m = msg.match(/pay\s+(?:the\s+)?(.+?)\s+\$?(\d+(?:\.\d+)?)/i);
  if (!m) return { vendor: "unknown", amount: 0, confidence: 0.3 };
  return { vendor: m[1].trim(), amount: Math.round(parseFloat(m[2]) * 100), confidence: 0.8 };
}
