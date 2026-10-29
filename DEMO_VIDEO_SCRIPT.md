# SIC Payment Agent - Demo Video Script (3 Minutes)

## Video Metadata
- **Title:** SIC Payment Agent — Agentic Commerce Platform for PayPal AI Hackathon
- **Duration:** 3:00 (180 seconds)
- **Format:** 1080p, 30fps, H.264
- **Upload:** YouTube (Public)
- **Tags:** PayPal, AI, Hackathon, Agentic Commerce, PayPal Agent Toolkit, MCP, AG Grid

---

## Shot List & Timing

### 0:00-0:15 — Hook & Architecture (15s)
**Visual:** Terminal → `pnpm dev` → Browser opens to http://localhost:3000
**Audio:** "SIC Payment Agent — an agentic commerce platform where every financial decision is AI-scored, confidence-gated, and executed on PayPal rails."

**Visual:** Dashboard loads — Decision Stream animates in real-time
**Audio:** "Built for the PayPal AI Hackathon, targeting 8 prize categories with a single unified platform."

**Visual:** Quick cuts — AG Grid dashboard, MCP connection, APIMatic context
**Audio:** "PayPal Agent Toolkit native. MCP ready. APIMatic powered. AG Grid self-serve."

---

### 0:15-0:45 — Conversational Money Movement (30s)
**Visual:** Click **Chat** tab → Type: `"pay the coffee supplier $450"`
**Audio:** "Natural language becomes structured intent. The Payment Guard evaluates vendor history, amount patterns, and conversational clarity."

**Visual:** Decision Matrix narration appears: *"Confidence 42% — vendor unknown, amount exceeds typical range. Escalating for approval."*
**Audio:** "Confidence: 42%. Below the 70% threshold. The agent escalates — never auto-pays low confidence."

**Visual:** Confirmation dialog → Click "Confirm" → Toast: "Payout executed! Batch: R6GPQMW6MKX6Q"
**Audio:** "Human approves. PayPal Payouts API executes. Real-time status update."

**Visual:** Switch to **Approvals** tab → See payout in grid with status "processing"
**Audio:** "Full audit trail in the Approvals grid — AG Grid sorting, filtering, export ready."

---

### 0:45-1:15 — Invoicing Lifecycle (30s)
**Visual:** Click **Invoices** tab → Click "Create Invoice"
**Audio:** "Full invoicing lifecycle via @paypal/agent-toolkit — not raw API calls, but AI-native tools."

**Visual:** Fill form — Recipient, Items (Web Dev × 1 @ $2,500 + 8% tax), Note, Due 30 days → "Create & Send"
**Audio:** "Create invoice → Send via PayPal → Track status → All through Agent Toolkit tools."

**Visual:** Invoice appears in AG Grid — Status: "sent" → Click "Remind" → Toast: "Reminder sent"
**Audio:** "Send reminders with one click. The toolkit handles the complexity."

**Visual:** Click "Record Payment" → Enter 250000 → Status changes to "paid" with green badge
**Audio:** "Record payment → Status updates instantly. Recurring series supported for subscriptions."

---

### 1:15-1:45 — Subscriptions & Products (30s)
**Visual:** Click **Subscriptions** tab → "Create Plan" → Pro Monthly $29.99/MONTH
**Audio:** "Subscription management — create plans, subscribe customers, pause, resume, cancel."

**Visual:** "Subscribe Customer" → subscriber@example.com → Status: "active" → Click "Pause" → "paused" → "Resume" → "active"
**Audio:** "Full lifecycle control. Webhook-ready for production."

**Visual:** Click **Products** tab → Search "wireless headphones" (Channel3) → Results populate grid
**Audio:** "Channel3 integration — 100M+ products searchable. Create PayPal catalog entries instantly."

**Visual:** Click "Create Invoice" on a product → Pre-filled invoice modal
**Audio:** "Product → Invoice → PayPal Order. Seamless commerce flow."

---

### 1:45-2:15 — MCP & APIMatic (30s)
**Visual:** Click **MCP** tab → "Connect Remote MCP" → Spinner → "CONNECTED" → Tools list populates (20+ tools)
**Audio:** "Model Context Protocol — connect to PayPal's hosted MCP at mcp.paypal.com or run locally."

**Visual:** Select `create_invoice` tool → JSON args auto-filled → "Call Tool" → Result: invoice_id + link
**Audio:** "Call PayPal tools directly from Claude Desktop, Cursor, or our UI. No code required."

**Visual:** Click **APIMatic** tab → "Load PayPal API Context" → Complete API docs render in monospace
**Audio:** "APIMatic generates instant PayPal API context formatted for any LLM. One click, copy to clipboard."

**Visual:** Type query: "How to create subscription with trial?" → "Get Context" → Relevant subset appears
**Audio:** "Query-specific context extraction — feed exactly what the LLM needs, nothing more."

---

### 2:15-2:45 — Decision Matrix Deep Dive (30s)
**Visual:** Click **Decisions** tab → AG Grid with 50+ rows — Module, Confidence, Threshold, Decision, Narration
**Audio:** "Every consequential action flows through the Decision Matrix. Confidence scored, narrated, tracked."

**Visual:** Click a row → Shows LLM narration: *"Low confidence because vendor 'Acme Corp' has no payment history and $5,000 exceeds typical $200 vendor average by 25x."*
**Audio:** "Plain English explanations. No black box. Confidence vs threshold visualized."

**Visual:** Filter by Module: "payment-guard" → Sort by Confidence desc → Export CSV
**Audio:** "Self-serve analytics. Export for compliance. Outcome tracking enables threshold learning."

---

### 2:45-3:00 — Close & Call to Action (15s)
**Visual:** Dashboard wide shot — All tabs visible → GitHub repo URL → YouTube link → Render URL
**Audio:** "SIC Payment Agent — PayPal-native, AI-centric, confidence-gated. Built for the PayPal AI Hackathon."

**Visual:** Text overlay: "🏆 Targeting: Best Overall | PayPal+AI | Agentic Commerce | AG Grid | Channel3 | APIMatic | Render"
**Audio:** "Targeting 8 prize categories. One platform. Zero bolted-on AI."

**Visual:** Fade to black with: `github.com/your-repo/sic-payment-agent` | `sic-payment-agent.onrender.com`
**Audio:** "Try it live. Fork it. Build on it. PayPal + AI = What's Next."

---

## Recording Checklist

### Pre-Recording
- [ ] Clean browser (incognito, no extensions visible)
- [ ] Terminal at `sic-payment-agent` directory
- [ ] `.env` configured with sandbox credentials
- [ ] NVIDIA_API_KEY or Ollama running
- [ ] Screen recording software ready (OBS, ScreenFlow, etc.)
- [ ] Microphone tested
- [ ] 1080p recording area set

### During Recording
- [ ] Speak clearly, moderate pace
- [ ] Pause 1s between actions for editing
- [ ] Show keyboard shortcuts (Ctrl+Click for new tabs)
- [ ] Highlight key UI elements with mouse hover
- [ ] If error occurs, narrate recovery naturally

### Post-Production
- [ ] Trim to exactly 3:00
- [ ] Add captions for accessibility
- [ ] Add zoom/callout effects for key UI moments
- [ ] Background music: subtle, royalty-free
- [ ] End screen with links
- [ ] Upload to YouTube (Public)
- [ ] Add to Devpost submission

---

## Key Talking Points (Memorize)

1. **"PayPal-native, not bolted-on"** — Every feature uses PayPal APIs as the rail
2. **"AI in the loop, not on the side"** — LLM scores, narrates, decides every action
3. **"Confidence-gated safety"** — Never auto-executes below threshold
4. **"Agent Toolkit native"** — 30+ PayPal tools as AI functions, not raw HTTP
5. **"MCP ready"** — Remote (mcp.paypal.com) + Local (stdio) support
6. **"Self-serve analytics"** — AG Grid: sort, filter, group, pivot, export
7. **"Instant context"** — APIMatic → PayPal API docs for any LLM in seconds
8. **"Production-ready"** — SQLite dev, PostgreSQL prod, Render deploy, health checks

---

## Backup Demo Flows (if primary fails)

| Primary | Backup |
|---------|--------|
| Chat payout | Direct API: `POST /api/guard/request` |
| Invoice create | Direct API: `POST /api/invoices` |
| MCP remote | MCP local (`Connect Local MCP`) |
| Channel3 search | Local products fallback |
| NVIDIA LLM | Ollama fallback (auto) |

---

## Devpost Submission Checklist

- [ ] Project title: "SIC Payment Agent — Agentic Commerce Platform"
- [ ] Tagline: "Every financial decision AI-scored, confidence-gated, executed on PayPal rails"
- [ ] Description: (from README.md)
- [ ] Demo video: YouTube URL (3:00, public)
- [ ] Live demo: https://sic-payment-agent.onrender.com
- [ ] GitHub repo: Public, with MIT license
- [ ] Technologies: PayPal Agent Toolkit, MCP, Vercel AI SDK, AG Grid, Channel3, APIMatic, NVIDIA Nemotron
- [ ] Prize categories: Select all 10
- [ ] Team: D. Young & Co. (Daniel Young)