import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { requireAdminForMutations } from "../src/middleware/auth.js";
function mockRes() {
  const res: any = {};
  res.statusCode = 0;
  res.body = null;
  res.status = (code: number) => { res.statusCode = code; return res; };
  res.json = (body: any) => { res.body = body; return res; };
  return res;
}
describe("requireAdminForMutations", () => {
  const savedEnv = { ...process.env };
  beforeEach(() => { process.env = { ...savedEnv }; });
  afterEach(() => { process.env = { ...savedEnv }; });
  it("lets GET through without a token", () => {
    delete process.env.ADMIN_TOKEN;
    process.env.NODE_ENV = "development";
    let nextCalled = false;
    requireAdminForMutations({ method: "GET", headers: {} } as any, mockRes(), () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });
  it("rejects a POST with no token when ADMIN_TOKEN is set", () => {
    process.env.ADMIN_TOKEN = "secret-token";
    const res = mockRes();
    let nextCalled = false;
    requireAdminForMutations({ method: "POST", headers: {} } as any, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });
  it("accepts a POST with the correct x-admin-token", () => {
    process.env.ADMIN_TOKEN = "secret-token";
    const res = mockRes();
    let nextCalled = false;
    requireAdminForMutations({ method: "POST", headers: { "x-admin-token": "secret-token" } } as any, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(true);
  });
  it("fails closed in production when ADMIN_TOKEN is unset", () => {
    delete process.env.ADMIN_TOKEN;
    process.env.NODE_ENV = "production";
    const res = mockRes();
    let nextCalled = false;
    requireAdminForMutations({ method: "POST", headers: {} } as any, res, () => { nextCalled = true; });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(503);
  });
});
