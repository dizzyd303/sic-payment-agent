import { Router } from "express";
import { handleMessage } from "./service.js";
import { approvePendingPayout } from "../payment-guard/service.js";
import { db } from "../../db/init.js";
export const conversationalRouter: Router = Router();

conversationalRouter.post("/message", async (req, res) => {
  const { message } = req.body;
  res.json(await handleMessage(message));
});

// Confirm approves ONLY the stored pending payout identified by pendingId.
// Caller-supplied vendor/amount, if present, must match the stored row.
// Receiver must be supplied here or already stored on the row; there is
// no placeholder, no dummy receiver, and no new transaction is created.
conversationalRouter.post("/confirm", async (req, res) => {
  const { pendingId, receiver, vendor, amount_cents, memo } = req.body;
  if (!pendingId) return res.status(400).json({ error: "pendingId_required", message: "Confirm requires the pendingId returned by /message" });
  const row = await db.prepare("SELECT * FROM payouts WHERE id=?").get(pendingId) as { vendor_name: string; amount_cents: number; status: string; receiver: string | null } | undefined;
  if (!row) return res.status(404).json({ error: "not_found" });
  if (row.status !== "pending") return res.status(409).json({ error: "payout_not_pending", status: row.status });
  if (vendor && vendor.toString().trim().toLowerCase() !== row.vendor_name) return res.status(409).json({ error: "mismatch", field: "vendor" });
  if (amount_cents && Number(amount_cents) !== row.amount_cents) return res.status(409).json({ error: "mismatch", field: "amount_cents" });
  const finalReceiver = (receiver?.toString().trim() || row.receiver || "").trim();
  if (!finalReceiver) return res.status(400).json({ error: "receiver_required", message: "Supply the PayPal email for this vendor; no placeholder will be used" });
  if (memo) await db.prepare("UPDATE payouts SET notes=? WHERE id=?").run(memo, pendingId);
  try {
    const result = await approvePendingPayout(pendingId, finalReceiver);
    res.json({ ...result, autoApproved: true });
  } catch (e: any) {
    const code = e.statusCode ?? 422;
    res.status(code).json({ error: "payout_failed", message: e?.response?.data?.message || e.message || "PayPal error", code: e?.response?.data?.name || "UNKNOWN" });
  }
});
