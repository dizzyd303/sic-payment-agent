# Decision Matrix Core — Design (as implemented)

## What this actually is
A deterministic payment-risk policy with AI-generated explanations and
decision logging. It is NOT an LLM-derived confidence score and NOT a
learning loop yet.

- `score()` is a fixed heuristic: base 0.5, +0.3 if the vendor is known,
  +0.1 / -0.2 for amount-normal vs amount-abnormal in Payment Guard.
  Unknown vendors get amountNormal = false, so they score 0.3 and escalate.
- The LLM only writes the plain-English narration in `generateNarration()`.
  It never changes the score, and a narration failure falls back to a
  plain "confidence vs threshold" sentence.
- `thresholdFor()` returns fixed values: receivables 0.6, payment-guard
  from CONFIDENCE_THRESHOLD (default 0.7), conversational 0.75, else 0.7.
- `recordOutcome()` inserts a row into `outcomes` for audit. No code reads
  outcomes to adapt thresholds. Threshold adaptation, scorecards, and
  `getScorecard()` described in earlier drafts are NOT implemented and
  must not be claimed in a submission.

## Decision flow
1. Module parses input into features.
2. `decide()` scores deterministically, compares to the fixed threshold.
3. >= threshold: auto path (still gated by the module: chat always goes
   through the explicit confirm step with a stored pending payout).
4. < threshold: escalate / require owner approval, never auto-pay.
5. Outcome is recorded only when PayPal reports a terminal result
   (see payment-guard `syncPayout()`), or when a payout fails, or when
   an approval is rejected/escalated. Batch acceptance ("processing")
   is NOT recorded as success.

## Safety
Never execute on perception alone. Low confidence always escalates.
Chat confirm approves only the exact stored pending payout, with a real
receiver supplied by the user or stored on that row.
