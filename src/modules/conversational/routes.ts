import { Router } from "express";
import { handleMessage } from "./service.js";
import { approvePendingPayout } from "../payment-guard/service.js";
import { db } from "../../db/init.js";
export const conversationalRouter: Router = Router();

conversationalRouter.post("/message", async (req, res) => {
  const { message } = req.body;
  res.json(await handleMessage(message));
});

// Confirm only approves the stored pending payout. Supplied details must match it.
conversationalRouter.post("/confirm", async (req, res) => {
  const { pendingId, receiver, vendor, amount_cents, memo } = req.body;
  if (!pendingId) return res.status(400).json({ error: "pendingId_required", message: "Confirm requires the pendingId returned by /message" });
  const row = await db.prepare("SELECT * FROM payouts WHERE id=?").get(pendingId) as { vendor_name: string; amount_cents: number; status: string; receiver: string | null; notes: string | null; currency: string } | undefined;
  if (!row) return res.status(404).json({ error: "not_found" });
  if (row.status !== "pending") return res.status(409).json({ error: "payout_not_pending", status: row.status });
  // Vendor names are compared case-insensitively.
  if (vendor && vendor.toString().trim().toLowerCase() !== row.vendor_name.toString().trim().toLowerCase()) return res.status(409).json({ error: "mismatch", field: "vendor" });
  // Check amount whenever it is supplied, including 0.
  if (amount_cents !== undefined && amount_cents !== null && (!Number.isInteger(Number(amount_cents)) || Number(amount_cents) !== row.amount_cents)) return res.status(409).json({ error: "mismatch", field: "amount_cents" });
  // A supplied memo must match the stored one.
  if (memo !== undefined && memo !== null && memo.toString() !== (row.notes ?? "")) return res.status(409).json({ error: "mismatch", field: "memo" });
  const finalReceiver = (receiver?.toString().trim() || row.receiver || "").trim();
  if (!finalReceiver) return res.status(400).json({ error: "receiver_required", message: "Supply the PayPal email for this vendor; no placeholder will be used" });
  try {
    const result = await approvePendingPayout(pendingId, finalReceiver);
    res.json({ ...result, autoApproved: true });
  } catch (e: any) {
    const code = e.statusCode ?? 422;
    res.status(code).json({ error: "payout_failed", message: e?.response?.data?.message || e.message || "PayPal error", code: e?.response?.data?.name || "UNKNOWN" });
  }
});
