# SIC Payment Agent - Judge Runbook

## Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/dizzyd303/sic-payment-agent.git
cd sic-payment-agent

# 2. Install dependencies (Node 22 required — better-sqlite3 does not run on Node 24)
nvm use 22
pnpm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your PayPal Sandbox credentials (see below)

# 4. Build and start
pnpm build
PORT=3001 DATABASE_URL=./data/demo.db NODE_ENV=development node dist/main.js

# 5. Open http://localhost:3001
```

## Required Environment Variables

```bash
# PayPal Sandbox (REQUIRED)
# Get from: https://developer.paypal.com/dashboard/ → Apps & Credentials
PAYPAL_CLIENT_ID=your_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_sandbox_client_secret
PAYPAL_MODE=sandbox

# LLM Provider (at least one REQUIRED — for parsing chat requests and narrating decisions)
# Option A: NVIDIA Nemotron
NVIDIA_API_KEY=your_nvidia_api_key
# Option B: Ollama local (fallback)
# OLLAMA_URL=http://localhost:11434

# Server
PORT=3000
CONFIDENCE_THRESHOLD=0.7
```

## Demo Flow: Payment Guard

One flow, end to end. Run it with the script used in the demo video, or by hand:

```bash
# In a second terminal, with the server running on port 3001:
node demo-run.mjs
```

What the script does, step by step:

1. **Chat message** — "pay the plumber $200 to plumber@example.com" becomes a stored pending payout. No payment has been sent yet. Note the pending payout id.
2. **Blocked change, amount** — Confirm with amount_cents 0. The confirm is blocked with a mismatch response.
3. **Blocked change, receiver** — Confirm with a changed receiver. The confirm is blocked with a receiver mismatch response.
4. **Correct confirm** — Confirm with the exact stored amount, vendor, memo, and receiver. The payout goes to processing and PayPal returns a batch id.
5. **Sync** — Sync polls PayPal. Batch acceptance is not success. Sync returns PROCESSING first, then completed with SUCCESS, and the outcome is recorded. Repeated syncs do not duplicate the outcome.

A replayed confirm after step 4 is blocked.

## Decision Matrix

1. Parse — The chat LLM parses vendor and amount from natural language. Guard features come from completed payout history in the database.
2. Score — Deterministic policy only. Vendor known plus amount within 50% of the median scores higher; unknown vendor or amount far from the median scores lower. The LLM does not score.
3. Threshold — Fixed at 0.7 for payment-guard. Below threshold, the payout escalates for human approval.
4. Route — Auto-execute or escalate to a human.
5. Narrate — The LLM explains the deterministic result in plain English.
6. Outcomes — Outcomes are logged for audit. Thresholds do not adapt.

## API Endpoints

| Module | Endpoints |
|--------|-----------|
| Guard | `/api/guard/request`, `/api/guard/approve/:id`, `/api/guard/sync/:id`, `/api/guard/reject/:id`, `/api/guard/evaluate`, `/api/guard/pending` |
| Chat | `/api/chat/message`, `/api/chat/confirm` |
| Decisions | `/api/decisions` |

## Demo Video

https://youtu.be/V8Li41eCue0 — 1:39, captioned, the same flow above.

## Troubleshooting

- **Node version:** Use Node 22. better-sqlite3 in this repo does not run on Node 24.
- **Port in use:** If port 3001 is already taken, set `PORT` to another port and set `BASE=http://127.0.0.1:<port>` when running `demo-run.mjs`.
- **PayPal credentials:** The server needs real PayPal Sandbox credentials in `.env`. Without them, PayPal calls fail and no batch id is returned.
- **LLM keys:** At least one LLM provider is needed for chat parsing and narration. If neither is set, chat parsing falls back and may fail.

## Contact

D. Young & Co. — Daniel Young, Fulton, Missouri
