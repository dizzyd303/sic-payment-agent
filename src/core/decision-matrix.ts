import { db } from '../db/init.js';
import { llmComplete } from '../services/llm/provider.js';
import crypto from 'node:crypto';

export type DecisionContext = {
  module: 'receivables' | 'payment-guard' | 'conversational';
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

export class DecisionMatrix {
  async decide(ctx: DecisionContext): Promise<DecisionResult> {
    const confidence = this.score(ctx);
    const threshold = this.thresholdFor(ctx.module);
    const requiresApproval = confidence < threshold;
    const decision = requiresApproval ? 'escalate' : 'auto';
    const id = crypto.randomUUID();
    const narration = await this.generateNarration(ctx, confidence, threshold, decision);
    db.prepare(`INSERT INTO decisions (id, module, action_type, context_json, features_json, confidence, threshold, decision, requires_approval, created_at, narration) VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?)`).run(
      id, ctx.module, ctx.action, JSON.stringify(ctx), JSON.stringify(ctx.features), confidence, threshold, decision, requiresApproval, narration
    );
    return { decisionId: id, confidence, threshold, decision, requiresApproval, reasons: [] };
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
    if (ctx.module === 'receivables') {
      const days = Number(ctx.features.daysOverdue ?? 0);
      const weeks = days / 7;
      const overdueScore = Math.min(0.3, weeks * 0.1);
      const priorSuccess = ctx.features.priorChaseSuccess ? 0.1 : 0;
      const neverPays = ctx.features.neverPays ? -0.2 : 0;
      score = 0.5 + overdueScore + priorSuccess + neverPays;
    }
    return Math.max(0, Math.min(1, score));
  }

  // Fixed thresholds. Adaptive learning is NOT implemented: outcomes are
  // recorded for audit, but thresholdFor() does not read them.
  private thresholdFor(module: string): number {
    const defaults = { 'receivables':0.6, 'payment-guard': parseFloat(process.env.CONFIDENCE_THRESHOLD||'0.7'), 'conversational':0.75 };
    return defaults[module as keyof typeof defaults] ?? 0.7;
  }
}

export const decisionMatrix = new DecisionMatrix();
