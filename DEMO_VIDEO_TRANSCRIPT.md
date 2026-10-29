# Demo Video Transcript — 3 Minutes

## 0:00-0:15 Hook & Architecture
[Visual: Terminal pnpm dev, browser opens]
"SIC Payment Agent — an agentic commerce platform where every financial decision is AI-scored, confidence-gated, and executed on PayPal rails."
[Visual: Architecture diagram]
"Built for PayPal AI Hackathon, targeting 8 prize categories."

## 0:15-0:45 Conversational Money Movement
[Visual: Chat tab]
Type: "pay the coffee supplier $450"
"Natural language becomes structured intent. Payment Guard evaluates vendor history, amount patterns."
[Visual: Decision Matrix]
"Confidence 42% — below 70% threshold. Escalates for approval."
[Visual: Confirm dialog → payout executed]
"Human approves. PayPal Payouts executes."

## 0:45-1:15 Invoicing Lifecycle
[Visual: Invoices tab]
"Full invoicing lifecycle via @paypal/agent-toolkit."
Create invoice → Send → Remind → Record payment
[Visual: AG Grid updates]
Status changes to paid in real-time.

## 1:15-1:45 Subscriptions & Products
[Visual: Subscriptions tab]
Create Plan → Subscribe → Pause/Resume/Cancel
[Visual: Products tab]
Channel3 search 100M+ products → Create invoice

## 1:45-2:15 MCP & APIMatic
[Visual: MCP tab]
Connect to mcp.paypal.com → tools load
Call create_invoice directly
[Visual: APIMatic tab]
Load PayPal API context → copy to LLM

## 2:15-2:45 Decision Matrix Deep Dive
[Visual: Decisions tab]
Real-time decision stream with LLM narration
Filter, sort, export CSV

## 2:45-3:00 Close
"PayPal-native, AI-centric, confidence-gated. Built for PayPal AI Hackathon."
Show links: GitHub, Render, YouTube

End screen with prize categories.
