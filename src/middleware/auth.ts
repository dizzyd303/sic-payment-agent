import type { Request, Response, NextFunction } from "express";
let warned = false;
export function requireAdminForMutations(req: Request, res: Response, next: NextFunction) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next();
  const token = process.env.ADMIN_TOKEN;
  if (token) {
    const presented = req.headers["x-admin-token"] || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (presented === token) return next();
    return res.status(401).json({ error: "unauthorized", message: "ADMIN_TOKEN required for money-mutating endpoints" });
  }
  if (process.env.NODE_ENV === "production") {
    return res.status(503).json({ error: "auth_not_configured", message: "Set ADMIN_TOKEN before using money endpoints in production" });
  }
  if (!warned) { warned = true; console.warn("[auth] ADMIN_TOKEN not set: mutations allowed in non-production only"); }
  return next();
}
