import { db } from '../db/init.js';
import { llmComplete } from '../services/llm/provider.js';
import crypto from 'node:crypto';

export type DecisionContext = {
  module: 'payment-guard' | 'conversational';
  action: string;
  features: Record<string, number | string | boolean>;
};

export type DecisionResult = {
  decisionId: string;
  confidence: number;
  threshold: number;
  decision: 'auto' | 'escalate' | 'reject';
  requiresApproval: boolean;
  reasons: string[];
};

function requiresApprovalReason(confidence: number, threshold: number): string {
  return confidence < threshold
    ? `score below threshold, approval required`
    : `score at or above threshold, auto-approval allowed`;
}

export class DecisionMatrix {
  // Deterministic policy reasons, sourced from the actual checks, not
  // from LLM narration. Narration is display text only; these reasons are
  // the risk explanation the UI should show (second review item 3).
  private reasonsFor(ctx: DecisionContext, confidence: number, threshold: number): string[] {
    const reasons: string[] = [];
    if (ctx.module === 'payment-guard') {
      const count = Number(ctx.features.historyCount ?? 0);
      if (ctx.features.vendorKnown) {
        reasons.push(`vendor known: ${count} completed prior payouts`);
      } else {
        reasons.push(count > 0
          ? `vendor history too thin: only ${count} completed prior payout(s), minimum is 3 for the known-vendor bonus`
          : 'vendor unknown: no completed prior payouts');
      }
      if (ctx.features.amountNormal) {
        reasons.push(`amount within 50% of the completed-history median ($${(Number(ctx.features.historicalMedianCents ?? 0) / 100).toFixed(2)})`);
      } else {
        reasons.push(ctx.features.vendorKnown
          ? 'amount outside 50% of the completed-history median'
          : 'amount has no sufficient history baseline to compare against');
      }
    } else {
      reasons.push(`score ${confidence.toFixed(2)} vs threshold ${threshold.toFixed(2)}`);
    }
    reasons.push(requiresApprovalReason(confidence, threshold));
    return reasons;
  }

  async decide(ctx: DecisionContext): Promise<DecisionResult> {
    const confidence = this.score(ctx);
    const threshold = this.thresholdFor(ctx.module);
    const requiresApproval = confidence < threshold;
    const decision = requiresApproval ? 'escalate' : 'auto';
    const reasons = this.reasonsFor(ctx, confidence, threshold);
    const id = crypto.randomUUID();
    const narration = await this.generateNarration(ctx, confidence, threshold, decision);
    db.prepare(`INSERT INTO decisions (id, module, action_type, context_json, features_json, confidence, threshold, decision, requires_approval, created_at, narration) VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?)`).run(
      id, ctx.module, ctx.action, JSON.stringify(ctx), JSON.stringify(ctx.features), confidence, threshold, decision, requiresApproval, narration
    );
    return { decisionId: id, confidence, threshold, decision, requiresApproval, reasons };
  }

  private async generateNarration(ctx: DecisionContext, confidence:number, threshold:number, decision:string) {
    const prompt = `Explain this payment-agent decision in one plain-English sentence.
Module: ${ctx.module}
Action: ${ctx.action}
Features: ${JSON.stringify(ctx.features)}
Confidence: ${(confidence*100).toFixed(0)}%
Threshold: ${(threshold*100).toFixed(0)}%
Decision: ${decision}
Return a concise reason why the confidence is what it is.`;
    try {
      const { text } = await llmComplete(prompt);
      return text.slice(0,500);
    } catch {
      return `Confidence ${(confidence*100).toFixed(0)}% vs threshold ${(threshold*100).toFixed(0)}% for ${ctx.module} ${ctx.action}.`;
    }
  }

  async recordOutcome(decisionId: string, outcome: 'success'|'failure'|'escalated') {
    db.prepare(`INSERT INTO outcomes (decision_id, outcome, observed_at) VALUES (?,?,CURRENT_TIMESTAMP)`).run(decisionId, outcome);
  }

  private score(ctx: DecisionContext): number {
    // Deterministic payment-risk policy, NOT an LLM-derived confidence.
    // The LLM only writes the plain-English narration (generateNarration);
    // it never changes the score. Thresholds are fixed (env/defaults) and
    // recordOutcome() only logs outcomes; no threshold adaptation exists yet.
    let score = 0.5;
    if (ctx.module === 'payment-guard') {
      const known = ctx.features.vendorKnown ? 0.3 : 0;
      const amountNormal = ctx.features.amountNormal ? 0.1 : -0.2;
      score = 0.5 + known + amountNormal;
    }
    return Math.max(0, Math.min(1, score));
  }

  // Fixed thresholds. Adaptive learning is NOT implemented: outcomes are
  // recorded for audit, but thresholdFor() does not read them.
  private thresholdFor(module: string): number {
    const defaults = { 'payment-guard': parseFloat(process.env.CONFIDENCE_THRESHOLD||'0.7'), 'conversational':0.75 };
    return defaults[module as keyof typeof defaults] ?? 0.7;
  }
}

export const decisionMatrix = new DecisionMatrix();
