import { decisionMatrix } from '../../core/decision-matrix.js';
import { llmComplete } from '../../services/llm/provider.js';

export async function handleMessage(message: string) {
  const hasPaymentKeyword = /\b(pay|send|transfer|payout)\b/i.test(message) && /\$?\d/.test(message);
  const parsePrompt = `Extract vendor name and amount in cents from: "${message}". Return JSON {vendor, amount_cents, confidence}.`;
  const { text } = await llmComplete(parsePrompt);
  let intent;
  try { intent = JSON.parse(text); } catch { intent = parseIntent(message); }
  const amountCents = intent.amount_cents ?? intent.amount ?? 0;
  const vendor = (intent.vendor || '').toString().trim().toLowerCase();
  const parseConf = intent.confidence ?? 0.3;

  const parseFailed = !hasPaymentKeyword || vendor === 'unknown' || !vendor || amountCents <= 0;
  if (parseFailed) {
    const conversationalReply = `I'm SIC Payment Agent, your PayPal-native payment assistant. I can:
• Track receivables and chase overdue invoices
• Guard outgoing payouts with confidence scoring and approval workflows
• Move money conversationally, e.g. "pay the plumber $200"
Try asking about a specific task, or say "pay <vendor> $<amount>" to start a payment.`;
    return {
      reply: conversationalReply,
      decisionId: null,
      confidence: 0,
      requiresApproval: false,
      parseFailed: true
    };
  }

  const decision = await decisionMatrix.decide({
    module: 'conversational',
    action: 'pay',
    features: { vendor, amount: amountCents, parseConfidence: parseConf }
  });
  return {
    reply: decision.requiresApproval ? `I need confirmation to pay ${vendor} $${(amountCents/100).toFixed(2)}` : `Executing payment to ${vendor}`,
    decisionId: decision.decisionId,
    confidence: decision.confidence,
    requiresApproval: decision.requiresApproval
  };
}

function parseIntent(msg: string) {
  const m = msg.match(/pay\s+(?:the\s+)?(.+?)\s+\$?(\d+(?:\.\d+)?)/i);
  if (!m) return { vendor:'unknown', amount:0, confidence:0.3 };
  return { vendor:m[1].trim(), amount: Math.round(parseFloat(m[2])*100), confidence:0.8 };
}
