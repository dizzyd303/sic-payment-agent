import { Router } from "express";
import { db } from "../../db/init.js";
import { evaluatePayout, requestPayout, approvePendingPayout, syncPayout } from "./service.js";
import { decisionMatrix } from "../../core/decision-matrix.js";
export const paymentGuardRouter: Router = Router();

paymentGuardRouter.post("/evaluate", async (req, res) => {
  const { vendor_name, amount, memo } = req.body;
  try {
    res.json(await evaluatePayout(vendor_name, amount, memo));
  } catch (e: any) {
    const code = e.statusCode ?? 422;
    res.status(code).json({ error: "evaluation_failed", message: e?.message || "Evaluation error" });
  }
});

paymentGuardRouter.post("/request", async (req, res) => {
  const { vendor_name, receiver, amount, memo } = req.body;
  try {
    res.json(await requestPayout(vendor_name, receiver, amount, memo));
  } catch (e: any) {
    res.status(422).json({ error: "payout_failed", message: e?.response?.data?.message || e.message || "PayPal error", code: e?.response?.data?.name || "UNKNOWN" });
  }
});

paymentGuardRouter.get("/pending", async (_, res) => {
  const stmt = db.prepare("SELECT * FROM payouts WHERE requires_approval=TRUE AND status=?");
  const rows = await stmt.all("pending");
  res.json(rows);
});

paymentGuardRouter.post("/approve/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await approvePendingPayout(id, req.body?.receiver);
    res.json({ id, status: "processing", batchId: result.batchId });
  } catch (e: any) {
    const code = e.statusCode ?? 422;
    if (code === 404) return res.status(404).json({ error: "not found" });
    res.status(code).json({ error: "payout_failed", message: e?.response?.data?.message || e.message || "PayPal error", code: e?.response?.data?.name || "UNKNOWN" });
  }
});

paymentGuardRouter.post("/sync/:id", async (req, res) => {
  const { id } = req.params;
  try {
    res.json(await syncPayout(id));
  } catch (e: any) {
    const code = e.statusCode ?? 422;
    if (code === 404) return res.status(404).json({ error: "not found" });
    res.status(code).json({ error: "sync_failed", message: e?.response?.data?.message || e.message || "PayPal error" });
  }
});

paymentGuardRouter.post("/reject/:id", async (req, res) => {
  const { id } = req.params;
  const stmt = db.prepare("SELECT * FROM payouts WHERE id=?");
  const row = await stmt.get(id) as { decision_id: string | null; status: string } | undefined;
  // Only a pending payout can be rejected.
  if (!row) return res.status(404).json({ error: "not found" });
  if (row.status !== "pending") return res.status(409).json({ error: "payout_not_pending", status: row.status });
  if (row.decision_id) {
    await decisionMatrix.recordOutcome(row.decision_id, "escalated");
  }
  const rejectStmt = db.prepare("UPDATE payouts SET status=?, requires_approval=FALSE WHERE id=? AND status=?");
  const moved = await rejectStmt.run("rejected", id, "pending");
  if (moved.changes === 0) return res.status(409).json({ error: "payout_not_pending", status: row.status });
  res.json({ id, status: "rejected" });
});
