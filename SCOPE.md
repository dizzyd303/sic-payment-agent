# SIC Payment Agent — Scope

Scaffolded TypeScript project at /home/spyda573/sic-payment-agent

## Project constraints
- Public repo holds offspring only. SIC core private.
- PayPal Sandbox rail works: OAuth client_credentials, POST /v2/checkout/orders confirmed.
- No Invoicing API scope. Ledger is SQLite agent-owned.
- Secrets in .env, never committed.
- Demo must run against PayPal Sandbox.
- Combo UI: chat + dashboard.

## Shared scaffold
- Node 20+, TypeScript ESM, Express API
- better-sqlite3 ledger: receivables, payouts, chase_log
- Services: paypal/client.ts for OAuth + Orders/Payouts
- .env.example defines PAYPAL_CLIENT_ID/SECRET, OPENAI_API_KEY, CONFIDENCE_THRESHOLD, OWNER_EMAIL
- Routes under /api/receivables, /api/guard, /api/chat

---

## 1. Receivables — agent-owned ledger, PayPal Orders as rail, overdue chase

Purpose: Track what's owed, mint PayPal Orders for collection, chase overdue.

Data model:
receivables(id, customer_name, amount_cents, currency, due_date, status, paypal_order_id, created_at, notes)
chase_log(receivable_id, chased_at, channel)

APIs:
POST /api/receivables {customer_name, amount, currency, due_date?, notes?} → creates ledger row + POST /v2/checkout/orders intent=CAPTURE, return order id/link
GET /api/receivables?status=open
GET /api/receivables/:id
POST /api/receivables/:id/chase → log chase, simulate notification

Services:
receivablesService.createReceivable()
receivablesService.createPayPalOrder()
receivablesService.syncStatus(orderId) — poll GET /v2/checkout/orders/{id}
receivablesService.chaseOverdue() — cron/check due_date < today and status=open → update chase_log

PayPal interaction:
Client credentials token fetch, POST /v2/checkout/orders with purchase_units amount breakdown, return link.
No webhook dependency; demo polls for status.

Chase logic:
Threshold: due_date passed + grace 3 days
Actions: log chase, add dashboard flag, optional agent chat nudge

Dependencies: paypal/client, db

---

## 2. Payment Guard — confidence gate for outgoing payouts

Purpose: Never auto-pay low confidence; route to owner.

Data model:
payouts(id, vendor_name, amount_cents, currency, status, paypal_payout_batch_id, confidence, requires_approval, approved_by, created_at, notes)

APIs:
POST /api/guard/evaluate {vendor_name, amount, currency, memo?} → returns {confidence, requires_approval, reasons[]}
POST /api/guard/request {vendor_name, amount, currency, memo?} → creates payout row, evaluates, saves pending if low confidence
GET /api/guard/pending → list requires_approval=1
POST /api/guard/approve/:id {approved_by} → approve and trigger payout
POST /api/guard/reject/:id

Services:
guardEvaluator.computeConfidence(vendor, amount) → features: vendor known from past payouts, amount z-score vs vendor history, amount vs business typical, time-of-day anomaly
Threshold from CONFIDENCE_THRESHOLD env default 0.7
guardService.requestPayout() → evaluate → persist → if confidence >= threshold and auto-pay enabled → create PayPal payout batch; else set requires_approval

PayPal interaction:
POST /v1/payments/payouts with sender_batch_header + items. Sandbox only.

Never auto-pay: low confidence always requires approval, never creates payout.

Dependencies: db, paypal/client, conversational module for intent

---

## 3. Conversational Money Movement — natural language to Payouts

Purpose: "pay the plumber $200" → confirm → execute via guard.

APIs:
POST /api/chat/message {message} → returns assistant reply + optional pending action
GET /api/chat/history

Flow:
1. Intent extraction via OpenAI function calling: extract vendor_name, amount_cents, currency, memo
2. Guard evaluation via Payment Guard
3. If confidence high → ask confirmation? For demo, confirm via dashboard/chat
4. On confirmation → create payout request → PayPal Payouts API
5. Return status

Services:
conversationalService.parseIntent(message) → structured intent
conversationalService.handleMessage() → orchestrates parse → guard → confirmation

UI:
Simple static dashboard at /ui with chat input top, receivables table, pending approvals, payout history.

Privacy: No secrets in repo, env loaded server-side only.

---

## Demo acceptance
- Create receivable → PayPal order link returned
- Overdue receivable appears with chase flag
- "pay plumber $200" → confidence computed, owner approval requested if low
- Approved payout → PayPal sandbox payout batch created
