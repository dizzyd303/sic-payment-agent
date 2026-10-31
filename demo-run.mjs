// Demo runner for SIC Payment Agent — Payment Guard flow.
// Runs the real API end-to-end, no staged outputs, no copy-paste on camera.
// Usage (server already running, e.g. port 3001):
//   node demo-run.mjs
//   BASE=http://127.0.0.1:3003 node demo-run.mjs
// It prints each step, pauses for narration/editing, and polls sync until
// PayPal reports SUCCESS (or fails loudly after 180s). It does NOT kill the
// server — press Ctrl+C in the server terminal for the end shot, as before.
// This file is a demo helper, not product code. Do not commit it unless
// Daniel explicitly says to.
const BASE = process.env.BASE || "http://127.0.0.1:3001";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Visual ticker for video: never sit silent during a wait — print a dot
// per second so both terminals stay visibly alive while PayPal processes.
async function waitWithDots(ms) {
  const secs = Math.round(ms / 1000);
  for (let i = 0; i < secs; i++) { process.stdout.write("."); await sleep(1000); }
  process.stdout.write("\n");
}
async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(90000),
  });
  const text = await res.text();
  console.log(`\n$ POST ${path}  [HTTP ${res.status}]`);
  console.log(text);
  return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
}

console.log("SIC Payment Agent — Payment Guard demo");
console.log("Deterministic score, human approval, PayPal Payouts.");
await sleep(2000);

console.log("\n--- Step 1: natural language becomes a stored pending payout ---");
const chat = await post("/api/chat/message", { message: "pay the plumber $200 to plumber@example.com" });
const pendingId = chat.json && chat.json.pendingId;
if (!pendingId) { console.error("DEMO FAILED: no pendingId returned"); process.exit(1); }
console.log(`Pending payout: ${pendingId} — no payment sent yet.`);
await sleep(3000);

console.log("\n--- Step 2: the guard blocks a changed amount ---");
await post("/api/chat/confirm", { pendingId, amount_cents: 0 });
await sleep(3000);

console.log("\n--- Step 3: the guard blocks a changed receiver ---");
await post("/api/chat/confirm", { pendingId, receiver: "other@example.com", amount_cents: 20000 });
await sleep(3000);

console.log("\n--- Step 4: a human approves the exact payout ---");
const ok = await post("/api/chat/confirm", { pendingId, receiver: "plumber@example.com", amount_cents: 20000 });
if (ok.status !== 200) { console.error("DEMO FAILED: correct confirm did not return 200"); process.exit(1); }
await sleep(3000);

console.log("\n--- Step 5: sync checks PayPal — batch acceptance is not success ---");
let done = false;
for (let i = 0; i < 12 && !done; i++) {
  const sy = await post(`/api/guard/sync/${pendingId}`, {});
  if (sy.json && sy.json.status === "completed" && sy.json.paypalStatus === "SUCCESS") {
    console.log("\nDEMO COMPLETE: completed, PayPal SUCCESS.");
    done = true;
  } else if (sy.json && sy.json.status === "failed") {
    console.error("DEMO FAILED: payout failed in PayPal"); process.exit(1);
  } else {
    console.log("PayPal still processing — waiting, then syncing again.");
    await waitWithDots(15000);
  }
}
if (!done) { console.error("DEMO INCOMPLETE: did not reach SUCCESS in poll window"); process.exit(1); }
console.log("Deterministic guard, human approval, audit trail. That's the product.");
