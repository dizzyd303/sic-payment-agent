import { describe, it, expect } from "vitest";
import { toPgSql, withLimit1 } from "../src/db/pg-sql.js";
describe("toPgSql", () => {
  it("converts ? placeholders to $1, $2 in order", () => {
    expect(toPgSql("SELECT * FROM payouts WHERE vendor_name = ? AND status = ?")).toBe("SELECT * FROM payouts WHERE vendor_name = $1 AND status = $2");
  });
  it("leaves queries without placeholders unchanged", () => {
    expect(toPgSql("SELECT COUNT(*) as c FROM payouts")).toBe("SELECT COUNT(*) as c FROM payouts");
  });
});
describe("withLimit1", () => {
  it("appends LIMIT 1 when there is no LIMIT", () => {
    expect(withLimit1("SELECT * FROM payouts WHERE id = $1")).toBe("SELECT * FROM payouts WHERE id = $1 LIMIT 1");
  });
  it("does not double-append when LIMIT is already present", () => {
    expect(withLimit1("SELECT * FROM payouts WHERE status = $1 ORDER BY created_at DESC LIMIT 1")).toBe("SELECT * FROM payouts WHERE status = $1 ORDER BY created_at DESC LIMIT 1");
  });
});
