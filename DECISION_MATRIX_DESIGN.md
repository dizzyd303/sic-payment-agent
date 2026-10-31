# Decision Matrix Core — Design (as implemented)

## What this actually is
A fixed payment-risk policy. The LLM writes the narration, it doesn't score.

- `score()` is a fixed heuristic: base 0.5, +0.3 if the vendor is known,
  +0.1 / -0.2 for amount-normal vs amount-abnormal in Payment Guard.
  Unknown vendors get amountNormal = false, so they score 0.3 and escalate.
- The LLM only writes the plain-English narration in `generateNarration()`.
  It never changes the score, and a narration failure falls back to a
  plain "confidence vs threshold" sentence.
- `thresholdFor()` returns fixed values: payment-guard
  from CONFIDENCE_THRESHOLD (default 0.7), conversational 0.75, else 0.7.
- `recordOutcome()` inserts a row into `outcomes` for audit. Thresholds don't adapt.

## Decision flow
1. Module parses input into features.
2. `decide()` scores deterministically, compares to the fixed threshold.
3. >= threshold: auto path (still gated by the module: chat always goes
   through the explicit confirm step with a stored pending payout).
4. < threshold: escalate / require owner approval, never auto-pay.
5. Outcome is recorded only when PayPal reports a terminal result
   (see payment-guard `syncPayout()`), or when a payout fails, or when
   an approval is rejected/escalated. Batch acceptance ("processing")
   is not recorded as success.

## Safety
Never execute on perception alone. Low confidence always escalates.
Chat confirm approves only the exact stored pending payout, with a real
receiver supplied by the user or stored on that row.
