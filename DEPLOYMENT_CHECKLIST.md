# Render Deployment Checklist

## Pre-Deploy
- [ ] `pnpm run build` passes (Node 22 required — better-sqlite3 does not run on Node 24)
- [ ] `render.yaml` present and valid
- [ ] `.env` contains required vars locally

## Render Service Configuration
Service: `sic-payment-agent-api`
- Runtime: node
- Build Command: `pnpm install && pnpm run build`
- Start Command: `node dist/main.js`
- Port: 10000
- Health Check: `/health` (exists in `src/main.ts`, returns `{"ok":true}`)

Environment Variables to set in Render:
- `NODE_ENV=production`
- `PORT=10000`
- `PAYPAL_CLIENT_ID` = from sandbox
- `PAYPAL_CLIENT_SECRET` = from sandbox
- `PAYPAL_MODE=sandbox`
- `PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com`
- `NVIDIA_API_KEY` = from NVIDIA
- `DATABASE_URL` = from `sic-payment-db`
- `REDIS_URL` = from `sic-payment-redis`

## Post-Deploy Verification (proven flow only)
- [ ] `https://sic-payment-agent-api.onrender.com/health` returns `{"ok":true}`
- [ ] `POST /api/chat/message` returns a pending payout, no payment sent yet
- [ ] `POST /api/chat/confirm` with the exact stored payout returns processing with a PayPal batch id
- [ ] `POST /api/guard/sync/:id` returns the real PayPal batch status

Note, 2026-10-31: the live Render health endpoint was checked and returned "Not Found" at that time, even though `/health` exists in the code. Do not claim the live Render deployment works until a post-deploy check above passes after a fresh deploy.
