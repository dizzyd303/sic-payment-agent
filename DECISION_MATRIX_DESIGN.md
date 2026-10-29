# Decision Matrix Core — Design

## Purpose
Central scored decision substrate for all consequential actions in Receivables, Payment Guard, and Conversational Money Movement. No binary allow/deny. Every action is scored with confidence, thresholded, and escalated.

## Architecture
core/decision-matrix
  - DecisionEngine: score -> threshold -> routing
  - Scorecard: log decision, features, outcome, feedback loop
  - Policy: per-module thresholds, escalation paths, learning rate

Modules call matrix.decide(context) -> DecisionResult {confidence, action, requiresApproval, reasons[], escalation}

## Decision Flow
1. Perception: module parses input into facts, LLM extracts structured intent
2. Features: extract signals for scoring, LLM provides reasoning
3. Score: 0-1 confidence via heuristic + LLM reasoning, both in loop every decision
4. Threshold: compare to module policy
   - >= threshold: auto-execute with logging
   - < threshold: route to owner / confirmation
5. Execute: module performs PayPal action
6. Feedback: outcome recorded, scorecard updated, thresholds adapt

## Data Model
decisions table:
id, module, action_type, context_json, features_json, confidence, threshold, decision, requires_approval, created_at

outcomes table:
decision_id, outcome, observed_at, feedback_score

scorecard aggregates per module/action_type: mean confidence, hit rate, false positive rate

## Module policies

### Receivables — Chase decisions
Action: chase receivable
Features: days overdue, customer history, prior chase success, amount
LLM role: drafts human chase message, researches business context via Tavily for personalization
Confidence scoring:
- base 0.5
- +0.1 per week overdue, capped at +0.3
- +0.1 if prior chase collected
- -0.2 if customer never pays
- LLM reason adds to score and narrative
Threshold default 0.6
Escalation: low confidence -> log only, no chase notification; LLM draft only generated when decision proceeds

### Payment Guard — Payout decisions
Action: approve payout
Features: vendor known, amount vs historical mean, time anomaly, conversational intent clarity
LLM role: narrates why payout looks unusual for dashboard — e.g., "this vendor usually gets $200, this is $1,800 at 2am"
Confidence scoring:
- base 0.5
- +0.3 if vendor in past payouts
- +0.1 if amount within 1 std dev
- -0.3 if amount > 3x typical
- LLM reason influences confidence and explanation
Threshold default 0.7 from CONFIDENCE_THRESHOLD
Escalation: low confidence -> requires owner approval, never auto-pay

### Conversational — Intent execution
Action: execute payment instruction
LLM role: core intent parsing from natural language, extracts vendor/amount/memo, generates confirmation wording
Features: parse certainty, vendor match, amount reasonableness, guard confidence
Confidence = 0.7 * parse_confidence + 0.3 * guard_confidence
Threshold 0.75
Escalation: low confidence -> ask confirmation via chat/dashboard

## Learning
Threshold adapts slowly:
if hit rate >0.9 over last 50 decisions -> threshold += 0.02
if false positive >0.1 -> threshold -= 0.03
Clamped 0.5-0.9

## LLM providers
LLM is load-bearing in every module: Ollama local default, NVIDIA free tier, OpenAI fallback. Selectable via config. No vendor lock-in.

## Interfaces
matrix.decide(input: DecisionInput): Promise<DecisionResult>
matrix.recordOutcome(decisionId, outcome): Promise<void>
matrix.getScorecard(module): Scorecard

## Safety
Never execute on perception alone. Judgment layer separate. Low confidence always escalates, never auto-pays.
