import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Second-review regression tests (Fix 5). These tests never call PayPal:
// - validateAmountCents / median are pure.
// - claimPendingPayout, receiver-mismatch approve, and terminal sync all
//   return before any PayPal call, so dummy credentials are enough.
// - decision-matrix reasons are deterministic and do not depend on LLM
//   narration (generateNarration falls back if no LLM is available).
const TEST_DB = "./data/test-payment-guard.db";

async function loadModules() {
  vi.resetModules();
  process.env.PAYPAL_CLIENT_ID = "test-id";
  process.env.PAYPAL_CLIENT_SECRET = "test-secret";
  process.env.PAYPAL_BASE_URL = "https://api-m.sandbox.paypal.com";
  process.env.NODE_ENV = "development";
  process.env.DATABASE_URL = TEST_DB;
  delete process.env.NVIDIA_API_KEY;
  const service = await import("../src/modules/payment-guard/service.js");
  const matrix = await import("../src/core/decision-matrix.js");
  const dbMod = await import("../src/db/client.js");
  await dbMod.initDatabase();
  return { service, matrix, db: dbMod.db };
}

describe("payment-guard second-review fixes", () => {
  beforeAll(() => {
    try { fs.unlinkSync(TEST_DB); } catch {}
    try { fs.unlinkSync(`${TEST_DB}-wal`); } catch {}
    try { fs.unlinkSync(`${TEST_DB}-shm`); } catch {}
    fs.mkdirSync(path.dirname(TEST_DB), { recursive: true });
  });
  afterAll(async () => {
    const { db } = await loadModules();
    await db.close();
    try { fs.unlinkSync(TEST_DB); } catch {}
    try { fs.unlinkSync(`${TEST_DB}-wal`); } catch {}
    try { fs.unlinkSync(`${TEST_DB}-shm`); } catch {}
  });

  it("rejects invalid amounts: 0, negative, non-integer, over-cap", async () => {
    const { service } = await loadModules();
    for (const bad of [0, -100, 1.5, NaN, 1_000_001]) {
      expect(() => service.validateAmountCents(bad)).toThrow();
    }
    expect(service.validateAmountCents(200)).toBe(200);
    expect(service.median([100, 300, 200])).toBe(200);
    expect(service.median([100, 200])).toBe(150);
  });

  it("gives deterministic reasons, not an empty list, for known and unknown vendors", async () => {
    const { matrix } = await loadModules();
    const known = await matrix.decisionMatrix.decide({
      module: "payment-guard", action: "payout",
      features: { vendorKnown: true, amountNormal: true, vendorName: "vendor", amountCents: 200, historyCount: 5, historicalMedianCents: 200 },
    });
    expect(known.confidence).toBeCloseTo(0.9);
    expect(known.reasons.length).toBeGreaterThan(0);
    expect(known.reasons.join(" ")).toContain("5 completed");
    const unknown = await matrix.decisionMatrix.decide({
      module: "payment-guard", action: "payout",
      features: { vendorKnown: false, amountNormal: false, vendorName: "vendor", amountCents: 200, historyCount: 0, historicalMedianCents: 0 },
    });
    expect(unknown.confidence).toBeCloseTo(0.3);
    expect(unknown.reasons.join(" ")).toContain("unknown");
  });

  it("atomic claim: two concurrent claims on one pending payout, only one wins", async () => {
    const { service, db } = await loadModules();
    const id = "claim-race-1";
    await db.prepare("DELETE FROM payouts WHERE id=?").run(id);
    await db.prepare("INSERT INTO payouts (id, vendor_name, amount_cents, currency, status, confidence, requires_approval, notes, receiver, decision_id) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(id, "race-vendor", 200, "USD", "pending", 0.3, 1, null, "race@example.com", null);
    const results = await Promise.allSettled([
      service.claimPendingPayout(id),
      service.claimPendingPayout(id),
    ]);
    const won = results.filter((r) => r.status === "fulfilled").length;
    const lost = results.filter((r) => r.status === "rejected").length;
    expect(won).toBe(1);
    expect(lost).toBe(1);
    const row = await db.prepare("SELECT status FROM payouts WHERE id=?").get(id) as { status: string };
    expect(row.status).toBe("approving");
  });

  it("changed receiver at approve time is rejected, not silently overridden", async () => {
    const { service, db } = await loadModules();
    const id = "receiver-mismatch-1";
    await db.prepare("DELETE FROM payouts WHERE id=?").run(id);
    await db.prepare("INSERT INTO payouts (id, vendor_name, amount_cents, currency, status, confidence, requires_approval, notes, receiver, decision_id) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(id, "mismatch-vendor", 200, "USD", "pending", 0.3, 1, null, "original@example.com", null);
    await expect(service.approvePendingPayout(id, "changed@example.com")).rejects.toMatchObject({ statusCode: 409 });
    const row = await db.prepare("SELECT status, receiver FROM payouts WHERE id=?").get(id) as { status: string; receiver: string };
    // Claim was released back to pending, and the stored receiver is untouched.
    expect(row.status).toBe("pending");
    expect(row.receiver).toBe("original@example.com");
  });

  it("duplicate sync on a terminal payout records no second outcome", async () => {
    const { service, db } = await loadModules();
    const decisionId = "sync-decision-1";
    const payoutId = "sync-payout-1";
    await db.prepare("DELETE FROM outcomes WHERE decision_id=?").run(decisionId);
    await db.prepare("DELETE FROM payouts WHERE id=?").run(payoutId);
    await db.prepare("DELETE FROM decisions WHERE id=?").run(decisionId);
    await db.prepare("INSERT INTO decisions (id, module, action_type, context_json, features_json, confidence, threshold, decision, requires_approval, narration) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(decisionId, "payment-guard", "payout", "{}", "{}", 0.9, 0.7, "auto", 0, "test");
    await db.prepare("INSERT INTO payouts (id, vendor_name, amount_cents, currency, status, confidence, requires_approval, notes, receiver, decision_id, paypal_payout_batch_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .run(payoutId, "sync-vendor", 200, "USD", "completed", 0.9, 0, null, "sync@example.com", decisionId, "BATCH-TEST");
    await db.prepare("INSERT INTO outcomes (decision_id, outcome) VALUES (?,?)").run(decisionId, "success");
    const before = await db.prepare("SELECT COUNT(*) AS n FROM outcomes WHERE decision_id=?").get(decisionId) as { n: number };
    const result = await service.syncPayout(payoutId);
    expect(result.status).toBe("completed");
    const after = await db.prepare("SELECT COUNT(*) AS n FROM outcomes WHERE decision_id=?").get(decisionId) as { n: number };
    expect(after.n).toBe(before.n);
  });
});
