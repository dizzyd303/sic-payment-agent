# Render Deployment Checklist

## Pre-Deploy
- [x] `pnpm run build` passes
- [x] `render.yaml` present and valid
- [x] `.env` contains required vars locally
- [x] `E2E_TEST_REPORT.md` created

## Render Service Configuration
Service: `sic-payment-agent-api`
- Runtime: node
- Build Command: `pnpm install && pnpm run build`
- Start Command: `node dist/main.js`
- Port: 10000
- Health Check: `/health`

Environment Variables to set in Render:
- `NODE_ENV=production`
- `PORT=10000`
- `PAYPAL_CLIENT_ID` = from sandbox
- `PAYPAL_CLIENT_SECRET` = from sandbox
- `PAYPAL_MODE=sandbox`
- `PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com`
- `NVIDIA_API_KEY` = nvapi-...
- `DATABASE_URL` = from `sic-payment-db`
- `REDIS_URL` = from `sic-payment-redis`
- Optional: `TAVILY_API_KEY`, `CHANNEL3_API_KEY`, `APIMATIC_API_KEY`

## Post-Deploy Verification
- [ ] `https://sic-payment-agent-api.onrender.com/health` returns `{"ok":true}`
- [ ] `POST /api/agent/workflow` returns success
- [ ] `POST /api/chat/message` returns decision
- [ ] UI loads at static site URL
- [ ] AG Grid dashboard loads
- [ ] MCP and APIMatic tabs accessible

## GitHub Actions / CI
- Ensure repo is public with MIT license
- README.md, JUDGE_RUNBOOK.md, DEMO_VIDEO_SCRIPT.md present

Ready for push to `main` to trigger auto-deploy.
