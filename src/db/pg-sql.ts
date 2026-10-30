// Pure Postgres SQL helpers, extracted from db/client.ts for testing.
// SQLite-style ? placeholders become $1, $2, ... in order.
export function toPgSql(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => "$" + ++i);
}
export function withLimit1(sql: string): string {
  return /LIMIT\s+\d+/i.test(sql) ? sql : sql + " LIMIT 1";
}
