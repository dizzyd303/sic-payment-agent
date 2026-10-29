# SIC Payment Agent - Judge Runbook

## Quick Start (2 minutes)

```bash
# 1. Clone the repository
git clone <repo-url>
cd sic-payment-agent

# 2. Install dependencies
pnpm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your PayPal Sandbox credentials (see below)

# 4. Start the application
pnpm dev

# 5. Open http://localhost:3000
```

## Required Environment Variables

```bash
# PayPal Sandbox (REQUIRED)
# Get from: https://developer.paypal.com/dashboard/ → Apps & Credentials
PAYPAL_CLIENT_ID=your_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_sandbox_client_secret
PAYPAL_MODE=sandbox
PAYPAL_BASE_URL=https://api-m.sandbox.paypal.com

# LLM Provider (at least one REQUIRED)
# Option A: NVIDIA Nemotron (free tier)
NVIDIA_API_KEY=your_nvidia_key
# Option B: Ollama local (fallback)
# Run: ollama pull llama3.1 && ollama serve

# Optional: Enhanced Features
TAVILY_API_KEY=your_tavily_key          # Business research for chase emails
CHANNEL3_API_KEY=your_channel3_key      # Product catalog search
APIMATIC_API_KEY=your_apimatic_key      # Instant PayPal API context
PAYPAL_MCP_URL=https://mcp.paypal.com   # Remote MCP server

# Server
PORT=3000
NODE_ENV=development
CONFIDENCE_THRESHOLD=0.7
```

## Demo Flows (5 Core Scenarios)

### Flow 1: "Morning Coffee" - Conversational Payout with Guard
**Target: Best Use of PayPal + AI, Best Use of Agentic Commerce**

1. Navigate to **Chat** tab
2. Type: `pay the coffee supplier $450`
3. Observe: Agent parses intent → Payment Guard evaluates → Low confidence → Asks for confirmation
4. Click "Confirm" in dialog
5. Observe: Payout created via PayPal Payouts API → Status updates in real-time

**Key Tech:** Vercel AI SDK + @paypal/agent-toolkit + Decision Matrix confidence gating

---

### Flow 2: "Freelancer Invoice" - Full Invoicing Lifecycle
**Target: Best Use of PayPal + AI, Best Use of Agentic Commerce**

1. Navigate to **Invoices** tab
2. Click **"Create Invoice"**
3. Fill form:
   - Recipient: `client@example.com` / `Acme Corp`
   - Items: Add "Web Development" × 1 @ $2,500.00 (tax 8%)
   - Note: "Q4 website redesign"
   - Due: 30 days
4. Click **"Create & Send"**
5. Observe: Invoice created via Agent Toolkit → Sent via PayPal → Status: "sent"
6. Click **"Remind"** → Observe reminder sent
7. Click **"Record Payment"** → Enter amount → Observe status: "paid"

**Key Tech:** @paypal/agent-toolkit (create_invoice, send_invoice, send_invoice_reminder, record_payment_for_invoice)

---

### Flow 3: "Subscription Business" - Recurring Revenue Management
**Target: Best Use of PayPal + AI, Best Use of Agentic Commerce**

1. Navigate to **Subscriptions** tab
2. Click **"Create Plan"**
   - Name: "Pro Monthly"
   - Description: "Access to premium features"
   - Price: $2999 (cents) = $29.99
   - Cycle: MONTH
3. Click **"Subscribe Customer"**
   - Plan ID: (from step 2)
   - Email: `subscriber@example.com`
   - Name: `John Subscriber`
4. Observe: Subscription created → Status: "active"
5. Click **"Pause"** → Observe: "paused"
6. Click **"Resume"** → Observe: "active"
7. Click **"Cancel"** → Observe: "cancelled"

**Key Tech:** @paypal/agent-toolkit (create_subscription_plan, create_subscription, update_subscription, cancel_subscription)

---

### Flow 4: "Product Sale" - Channel3 + PayPal Orders
**Target: Best Use of Channel3, Best Use of PayPal + AI**

1. Navigate to **Products** tab
2. Search: "wireless headphones" (uses Channel3 API if configured, else local)
3. Click **"Create Invoice"** on a product
4. Observe: Pre-filled invoice with product details
5. Complete invoice creation → PayPal Order created for payment

**Key Tech:** Channel3 API (100M+ products) + @paypal/agent-toolkit (create_product, create_order)

---

### Flow 5: "AI Assistant Dashboard" - AG Grid + Natural Language
**Target: Best Use of AG Grid**

1. Navigate to **Receivables** tab
2. Observe: AG Grid with sorting, filtering, pagination
3. Use column filters (click column menu → Filter)
4. Group by Status (drag "Status" to row groups)
5. Pivot: Status vs Currency
6. Export to CSV (right-click → Export)
7. Use natural language in Chat: "show me overdue receivables"

**Key Tech:** AG Grid Community (self-serve dashboards, drag-drop charts, AI assistant integration)

---

## Advanced Features to Show Judges

### MCP Integration (Model Context Protocol)
**Target: Best Use of Agentic Commerce**

1. Navigate to **MCP** tab
2. Click **"Connect Remote MCP"** → Connects to `mcp.paypal.com`
3. Observe: Tools loaded from PayPal's MCP server
4. Select a tool (e.g., `create_invoice`) → Enter JSON args → Click **"Call Tool"**
5. Observe: Direct MCP tool execution

**Alternative:** Click **"Connect Local MCP"** → Runs `@paypal/agent-toolkit mcp` locally

---

### APIMatic Instant Context
**Target: Best Use of APIMatic**

1. Navigate to **APIMatic** tab
2. Click **"Load PayPal API Context"**
3. Observe: Complete PayPal API documentation formatted for LLM consumption
4. Click **"Copy to Clipboard"** → Paste into any LLM (Claude, GPT, etc.)
4. Enter query: "How do I create a subscription with a trial period?"
5. Click **"Get Context for Query"** → Returns relevant API subset

---

### Decision Matrix - Confidence Gating
**Target: Most Innovative, Best Demo Delivery**

1. Navigate to **Decisions** tab
2. Observe: Real-time decision stream with confidence scores
3. Each decision shows:
   - Module (Receivables/Guard/Conversational)
   - Confidence % vs Threshold %
   - LLM-generated narration
   - Outcome tracking
4. Trigger decisions via Chat or Approvals
5. Observe: Low confidence → Escalation → Human approval required

---

### PayPal Agent Toolkit Tools Explorer
1. Navigate to **Agent** tab (or `/api/agent/tools`)
2. Observe: All 30+ PayPal tools exposed as AI functions
3. Test workflows via `/api/agent/workflow` with natural language prompts

---

## Architecture Highlights

```
┌─────────────────────────────────────────────────────────────┐
│  SIC Payment Agent v2 - Agentic Commerce Platform          │
├─────────────────────────────────────────────────────────────┤
│  UI Layer: React-style vanilla JS + AG Grid Community      │
│  Agent Layer: Vercel AI SDK + @paypal/agent-toolkit        │
│  Decision Layer: Custom Decision Matrix + LLM Narration    │
│  MCP Layer: @modelcontextprotocol/sdk (remote + local)     │
│  Data Layer: SQLite (dev) / PostgreSQL (prod)              │
│  PayPal Layer: Orders v2, Payouts v1, Invoicing, Subs...   │
│  External: NVIDIA Nemotron / Ollama / Tavily / Channel3    │
└─────────────────────────────────────────────────────────────┘
```

### Key Differentiators
1. **PayPal-Native**: Every feature uses PayPal APIs as the rail
2. **AI-Centric**: LLM in every decision loop, not bolted on
3. **Confidence-Gated**: Never auto-executes low-confidence actions
4. **Agent-Toolkit Native**: Uses @paypal/agent-toolkit, not raw API calls
5. **MCP-Ready**: Connects to PayPal's remote MCP server
6. **Multi-Prize**: Targets 8+ prize categories simultaneously

---

## API Endpoints Reference

| Module | Endpoint | Description |
|--------|----------|-------------|
| **Agent** | `GET /api/agent/tools` | List all PayPal Agent Toolkit tools |
| | `POST /api/agent/workflow` | Execute natural language workflow |
| | `POST /api/agent/invoice/create-and-send` | Create & send invoice |
| | `POST /api/agent/subscription/create-plan` | Create subscription plan |
| | `POST /api/agent/subscription/subscribe` | Subscribe customer |
| **Invoices** | `POST /api/invoices` | Create invoice (full form) |
| | `GET /api/invoices` | List all invoices |
| | `POST /api/invoices/:id/send` | Send invoice |
| | `POST /api/invoices/:id/remind` | Send reminder |
| | `POST /api/invoices/:id/qr-code` | Generate QR code |
| | `POST /api/invoices/:id/record-payment` | Record payment |
| **Subscriptions** | `POST /api/subscriptions/plans` | Create plan |
| | `GET /api/subscriptions/plans` | List plans |
| | `POST /api/subscriptions/subscribe` | Subscribe customer |
| | `GET /api/subscriptions` | List subscriptions |
| | `POST /api/subscriptions/:id/cancel` | Cancel |
| | `POST /api/subscriptions/:id/pause` | Pause |
| | `POST /api/subscriptions/:id/resume` | Resume |
| **Products** | `GET /api/products/search?q=` | Search (Channel3 + local) |
| | `GET /api/products` | List products |
| | `POST /api/products` | Create product |
| | `POST /api/products/from-channel3` | Import from Channel3 |
| **MCP** | `GET /api/mcp/status` | Connection status |
| | `POST /api/mcp/connect` | Connect (remote/local) |
| | `POST /api/mcp/disconnect` | Disconnect |
| | `GET /api/mcp/tools` | List MCP tools |
| | `POST /api/mcp/tools/:name` | Call MCP tool |
| **APIMatic** | `GET /api/apimatic/context` | Full PayPal API context |
| | `POST /api/apimatic/context-for-query` | Query-specific context |
| **Core** | `POST /api/receivables` | Create receivable (Order) |
| | `POST /api/receivables/:id/chase` | Chase overdue |
| | `POST /api/guard/evaluate` | Evaluate payout confidence |
| | `POST /api/guard/request` | Request payout |
| | `POST /api/guard/approve/:id` | Approve payout |
| | `POST /api/chat/message` | Conversational agent |

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "PayPal Agent credentials not configured" | Check `.env` has valid `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` |
| "LLM provider failed" | Ensure `NVIDIA_API_KEY` is set OR run `ollama serve` locally |
| "Invoicing API scope not provisioned" | Use Orders API as fallback (already implemented) |
| AG Grid not loading | Check browser console for CDN errors; verify internet access |
| MCP connection fails | Try "Connect Local MCP" instead; check firewall |
| Port 3000 in use | Set `PORT=3001` in `.env` |

---

## Demo Video Script (3 minutes)

### 0:00-0:30 - Hook & Architecture
"SIC Payment Agent - an agentic commerce platform where every financial decision is AI-scored, confidence-gated, and executed on PayPal rails."

Show: Architecture diagram → Dashboard with live decision stream

### 0:30-1:00 - Conversational Money Movement
"Pay the plumber $200" → Guard evaluates → Confidence 45% → Escalates → Human approves → Payout executes

Show: Chat tab → Decision Matrix narration

### 1:00-1:30 - Invoicing & Subscriptions (Agent Toolkit)
Create invoice → Send → Remind → Record payment → All via @paypal/agent-toolkit
Create subscription plan → Subscribe customer → Pause/Resume/Cancel

Show: Invoices & Subscriptions tabs with AG Grid

### 1:30-2:00 - Product Commerce (Channel3 + PayPal)
Search 100M+ products via Channel3 → Create invoice from product → PayPal Order

Show: Products tab with Channel3 search

### 2:00-2:30 - MCP & APIMatic
Connect to PayPal MCP server → Call tools directly
APIMatic generates instant PayPal API context for any LLM

Show: MCP & APIMatic tabs

### 2:30-3:00 - Decision Matrix & Close
Real-time decision stream with LLM narrations
Confidence thresholds, escalation paths, outcome learning

Show: Decisions tab → "Built for PayPal AI Hackathon - targeting 8+ prize categories"

---

## Live Demo URL (if deployed)
- Render: `https://sic-payment-agent.onrender.com`
- Health check: `https://sic-payment-agent.onrender.com/health`

---

## Contact
- GitHub: [Repository URL]
- Demo Video: [YouTube URL]
- Team: D. Young & Co. (Daniel Young)