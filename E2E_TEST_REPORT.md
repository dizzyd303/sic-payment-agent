> Update 2026-10-31: after the Oct 30 run above, decision amount units were fixed (dollars, with amount_cents preserved), Approvals approve now prompts for a receiver when a pending has none, AG Grid rendering was fixed for v36, and the UI nav was trimmed to Dashboard, Approvals, Chat, and Decisions. `pnpm exec tsc --noEmit` clean and `pnpm test` 13 passed again on 2026-10-31. The end-to-end flow above remains the Oct 30 run; it was not re-run end-to-end after the Oct 31 changes.

# SIC Payment Agent — End-to-End Test Report (fresh, 2026-10-30)

Server: localhost:3001, built with `pnpm run build` (tsc clean), test DB
`data/e2e-proof.db` (deleted after the run, not committed).
PayPal: Sandbox, via the direct Payouts API client (not the agent-toolkit
workflow tools).

## Build and tests
- `pnpm exec tsc --noEmit`: PASS, exit 0
- `pnpm test`: 13 passed (payment-guard 5, pg-sql 4, auth 4)
- `GET /health`: `{"ok":true}`
- `GET /api/mcp/configs`: 404 — the credential-leaking endpoint is gone

## Proven flow: Payment Guard, one flow end-to-end
1. `POST /api/guard/request` vendor `e2e-test-vendor` (unknown), receiver
   `e2e-test@example.com`, amount 100 cents, memo `E2E proof`
   -> `{"id":"68d2db95-f72a-4a84-ae3c-02c9151b8941","autoApproved":false,"requiresApproval":true}`
   Decision log for this payout: vendorKnown false, amountNormal false,
   narration correctly states there is no history to compare against and
   that is a risk signal. Unknown vendors no longer get the normal-amount bonus.
2. `POST /api/guard/approve/<id>` (exact stored pending row)
   -> `{"id":"68d2db95-...","status":"processing","batchId":"3CD2GNMS7P8RQ"}`
   Batch id is a real PayPal Sandbox payout batch id.
3. `POST /api/guard/sync/<id>`
   -> `{"id":"68d2db95-...","status":"processing","paypalStatus":"PENDING"}`
   Honest result: the batch is still PENDING in Sandbox (test receiver
   unclaimed), so the local status stays `processing` and NO success
   outcome is recorded. Batch acceptance is not claimed as payout success.
4. `GET /api/paypal/status`
   -> `{"healthy":true,"paypalConfigured":true,"failedCount":0,"lastFailed":null}`
   No hardcoded error code or message.

## Proven flow: Chat confirm, exact pending transaction only
1. `POST /api/chat/message` with "pay chat-test-vendor $2.00 to chat-test@example.com"
   -> pendingId c5279cd8-0aca-4601-a1cc-9a085de4865f, vendor chat-test-vendor,
   amount_cents 200, receiver chat-test@example.com, requiresApproval true,
   reply states no payment has been sent yet.
2. Confirm with wrong amount (999 cents) -> HTTP 409 mismatch / amount_cents, no payment.
3. Confirm with placeholder receiver acct@paypal.com -> HTTP 422
   receiver_placeholder_rejected, no payment, pending row intact.
4. Confirm with the stored pendingId and real receiver
   -> HTTP 200, batch P9QE7S9JEQ5TN, receiver chat-test@example.com, amount_cents 200.
5. Replay the same confirm -> HTTP 409 payout_not_pending, no double payment.

## What is NOT claimed as proven
- Invoice creation via the agent-toolkit workflow: the old report's
  `{"success":true,"data":"","steps":[]}` was not proof of a real invoice
  id/status, and PAYPAL.md notes Invoicing scope was not provisioned.
  Invoicer mapping is fixed (owner, never recipient), but invoice
  end-to-end is not claimed here until a real invoice id is returned.
- Subscription plan creation via the workflow: product id is now created
  from a real PayPal product instead of a fabricated `PROD-*`, and the
  `subscription_plans` table now exists, but a full plan+subscribe run
  is not claimed here.
- Agent-toolkit workflow tools generally: `agent-toolkit.ts` still carries
  `@ts-nocheck` with a comment explaining the ai@4 vs ai@7 tool API
  mismatch. A full v7 migration is a separate refactor, not papered over.
- Demo video: https://youtu.be/V8Li41eCue0 - 1:39, captioned, one Payment Guard flow end-to-end.
- Render deployment: `render.yaml` now has a single `services:` list
  (API service serving UI same-origin + Redis + Postgres database) and
  validates as YAML, but a live Render deploy was not run in this pass.
