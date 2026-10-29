# SIC Payment Agent — Agentic Commerce Platform

**Built for PayPal AI Hackathon 2026** — *Build What's Next with PayPal and AI*

An AI-native payment platform where every financial decision is scored, narrated, and confidence-gated — executed on PayPal rails.

## 🏆 Prize Categories Targeted

| Category | Prize | Status |
|----------|-------|--------|
| Best Overall | $12K / $8K / $5K | ✅ Targeting |
| Best Use of PayPal + AI | $5K | ✅ @paypal/agent-toolkit native |
| Best Use of Agentic Commerce | $5K | ✅ MCP + Workflows |
| Most Creative | $5K | ✅ Decision Matrix + LLM Narration |
| Most Impactful | $5K | ✅ Confidence-gated money movement |
| Best Demo Delivery | $5K | ✅ 5 polished demo flows |
| **Sponsor: AG Grid** | $5K / $2K / $1K | ✅ Self-serve dashboard |
| **Sponsor: Channel3** | $1.5K | ✅ 100M+ product catalog |
| **Sponsor: APIMatic** | $1K × 3 | ✅ Instant PayPal API context |
| **Sponsor: Render** | $1K credits | ✅ Deployment ready |

## 🚀 Quick Start

```bash
# Clone & install
git clone <repo-url>
cd sic-payment-agent
pnpm install

# Configure (see JUDGE_RUNBOOK.md for details)
cp .env.example .env
# Edit .env with PayPal Sandbox credentials + LLM keys

# Run
pnpm dev
# → http://localhost:3000
```

## 🎯 Core Features

### 1. Conversational Money Movement
Natural language → Structured intent → Confidence scoring → Human approval → PayPal Payout
```
"pay the plumber $200" → Guard evaluates (confidence: 45%) → Escalates → You approve → Executed
```

### 2. Receivables on PayPal Orders
Track what's owed → Create PayPal Orders for collection → AI-drafted chase emails → Overdue automation

### 3. Payment Guard — Confidence Gate
Every outgoing payout scored against:
- Vendor history
- Amount anomaly detection
- Time-of-day patterns
- Conversational clarity
**Never auto-pays low confidence**

### 4. Full Invoicing Lifecycle (Agent Toolkit)
Create → Send → Remind → QR Code → Record Payment → Recurring Series
All via `@paypal/agent-toolkit` tools, not raw API calls

### 5. Subscription Management
Plans → Subscribe → Pause → Resume → Cancel → Webhook-ready

### 4. Product Commerce (Channel3 + PayPal)
Search 100M+ products → Create PayPal catalog entries → Generate invoices/orders

### 5. MCP Integration (Model Context Protocol)
- **Remote:** Connect to `mcp.paypal.com` (PayPal's hosted MCP)
- **Local:** Run `@paypal/agent-toolkit mcp` via stdio
- Call PayPal tools directly from Claude Desktop, Cursor, or our UI

### 6. APIMatic Instant Context
One-click → Complete PayPal API documentation formatted for LLM consumption
Query-specific context extraction for any natural language request

### 7. AG Grid Self-Serve Dashboard
- Sorting, filtering, grouping, pivoting
- CSV/Excel export
- Column pinning, row selection
- Real-time updates

### 8. Decision Matrix — The Brain
Every consequential action:
1. **Perception** → LLM extracts structured features
2. **Scoring** → Heuristic + LLM reasoning → 0-1 confidence
3. **Threshold** → Module-specific (60-75%)
4. **Route** → Auto-execute OR Escalate to human
5. **Narrate** → LLM explains decision in plain English
6. **Learn** → Outcome tracking → Threshold adaptation

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  SIC Payment Agent v2                                       │
├─────────────────────────────────────────────────────────────┤
│  UI: Vanilla JS + AG Grid Community (no React build step)  │
│  Agent: Vercel AI SDK + @paypal/agent-toolkit              │
│  Decision: Custom Matrix + NVIDIA Nemotron / Ollama        │
│  MCP: @modelcontextprotocol/sdk (remote + local)           │
│  Data: SQLite (dev) / PostgreSQL (prod)                    │
│  PayPal: Orders v2, Payouts v1, Invoicing, Subscriptions   │
└─────────────────────────────────────────────────────────────┘
```

## 📁 Project Structure

```
sic-payment-agent/
├── src/
│   ├── main.ts                    # Express app + route mounting
│   ├── services/
│   │   ├── paypal/
│   │   │   ├── client.ts          # Direct PayPal API (OAuth, Orders, Payouts)
│   │   │   ├── agent-toolkit.ts   # @paypal/agent-toolkit wrapper + workflows
│   │   │   └── mcp-client.ts      # MCP client (remote + local)
│   │   ├── apimatic/client.ts     # APIMatic integration
│   │   ├── llm/provider.ts        # Multi-LLM (NVIDIA + Ollama)
│   │   └── tavily/client.ts       # Business research
│   ├── modules/
│   │   ├── agent/routes.ts        # Agent Toolkit endpoints
│   │   ├── receivables/           # Orders-based receivables
│   │   ├── payment-guard/         # Confidence-gated payouts
│   │   ├── conversational/        # NL → Payouts
│   │   ├── invoices/              # Full invoicing (Agent Toolkit)
│   │   ├── subscriptions/         # Subscription management
│   │   ├── products/              # Catalog (Channel3 + PayPal)
│   │   ├── mcp/                   # MCP connection UI
│   │   └── apimatic/              # APIMatic context UI
│   ├── core/decision-matrix.ts    # Confidence scoring engine
│   └── db/init.ts                 # SQLite schema
├── public/
│   ├── index.html                 # SPA with AG Grid CDN
│   ├── app.js                     # All UI logic (vanilla JS)
│   └── styles.css                 # Dark theme + AG Grid vars
├── JUDGE_RUNBOOK.md               # Complete demo guide
├── HACKATHON_STRATEGY.md          # Internal strategy doc
└── package.json
```

## 🔑 Key Technologies

| Tech | Purpose |
|------|---------|
| `@paypal/agent-toolkit` | PayPal tools as AI functions (30+ tools) |
| `ai` (Vercel AI SDK) | Agent framework, tool calling, streaming |
| `@modelcontextprotocol/sdk` | MCP client for PayPal MCP |
| `ag-grid-community` | Self-serve data grid (sponsor prize) |
| `better-sqlite3` | Local SQLite for dev |
| `axios` | HTTP client |
| `zod` | Schema validation |

## 🧪 Demo Flows (5 Scenarios)

1. **Morning Coffee** — Conversational payout with guard
2. **Freelancer Invoice** — Full invoicing lifecycle
3. **Subscription Business** — Recurring revenue management
4. **Product Sale** — Channel3 search → PayPal Order
5. **AI Dashboard** — AG Grid + natural language

See [JUDGE_RUNBOOK.md](./JUDGE_RUNBOOK.md) for step-by-step instructions.

## 🔧 Environment Variables

```bash
# Required
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_MODE=sandbox

# LLM (at least one)
NVIDIA_API_KEY=           # NVIDIA Nemotron free tier
# OR
OLLAMA_URL=http://localhost:11434  # Local Ollama

# Optional Enhancements
TAVILY_API_KEY=           # Business research
CHANNEL3_API_KEY=         # Product catalog
APIMATIC_API_KEY=         # Instant API context
PAYPAL_MCP_URL=https://mcp.paypal.com

# Server
PORT=3000
CONFIDENCE_THRESHOLD=0.7
```

## 📡 API Endpoints

| Module | Endpoints |
|--------|-----------|
| **Agent** | `/api/agent/tools`, `/api/agent/workflow`, `/api/agent/invoice/create-and-send`, `/api/agent/subscription/*` |
| **Invoices** | `/api/invoices` (CRUD + send/remind/qr/payment) |
| **Subscriptions** | `/api/subscriptions/plans`, `/api/subscriptions/subscribe`, `/api/subscriptions/:id/*` |
| **Products** | `/api/products/search`, `/api/products`, `/api/products/from-channel3` |
| **MCP** | `/api/mcp/status`, `/api/mcp/connect`, `/api/mcp/tools/:name` |
| **APIMatic** | `/api/apimatic/context`, `/api/apimatic/context-for-query` |
| **Core** | `/api/receivables`, `/api/guard/*`, `/api/chat/*`, `/api/decisions` |

## 🎬 Demo Video

[![SIC Payment Agent Demo](https://img.youtube.com/vi/VIDEO_ID/0.jpg)](https://youtu.be/VIDEO_ID)

**3-minute walkthrough** covering all 5 demo flows + MCP + APIMatic + Decision Matrix.

## 📝 License

MIT — Built for PayPal AI Hackathon 2026

## 🤝 Team

**D. Young & Co.** — Private AI Consulting & Investigative Research  
Fulton, Missouri

---

*Every financial decision deserves intelligence. Every payment deserves confidence. Every agent deserves PayPal.*