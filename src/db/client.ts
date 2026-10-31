import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { Pool, PoolClient } from 'pg';
import { toPgSql, withLimit1 } from './pg-sql.js';

// Database abstraction supporting both SQLite (dev) and PostgreSQL (prod)
const isProduction = process.env.NODE_ENV === 'production';
const databaseUrl = process.env.DATABASE_URL;

let pgPool: Pool | null = null;
let sqliteDb: ReturnType<typeof Database> | null = null;

interface DatabaseClient {
  prepare(sql: string): Statement;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

interface Statement {
  run(...params: any[]): Promise<{ changes: number; lastInsertRowid: number | bigint }>;
  get(...params: any[]): Promise<any>;
  all(...params: any[]): Promise<any[]>;
  iterate(...params: any[]): AsyncGenerator<any, void, unknown>;
}

function getSQLiteDb(): ReturnType<typeof Database> {
  if (!sqliteDb) {
    const dbPath = databaseUrl?.startsWith('postgres') ? './data/payments.db' : (databaseUrl ?? './data/payments.db');
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    sqliteDb = new Database(dbPath);
    // Enable WAL mode for better concurrency
    sqliteDb.exec('PRAGMA journal_mode = WAL;');
    sqliteDb.exec('PRAGMA foreign_keys = ON;');
  }
  return sqliteDb;
}

function getPgPool(): Pool {
  if (!pgPool && databaseUrl?.startsWith('postgres')) {
    pgPool = new Pool({
      connectionString: databaseUrl,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }
  return pgPool!;
}

// better-sqlite3 cannot bind JS booleans; code passes true/false so the
// Postgres adapter gets real booleans, and this adapter converts to 1/0.
const toSqliteParams = (params: any[]) => params.map((v) => (typeof v === "boolean" ? (v ? 1 : 0) : v));
function createSQLiteStatement(db: ReturnType<typeof Database>, sql: string): Statement {
  const stmt = db.prepare(sql);
  return {
    run: (...params: any[]) => Promise.resolve(stmt.run(...toSqliteParams(params))),
    get: (...params: any[]) => Promise.resolve(stmt.get(...toSqliteParams(params))),
    all: (...params: any[]) => Promise.resolve(stmt.all(...toSqliteParams(params))),
    iterate: async function* (...params: any[]) {
      for (const row of stmt.iterate(...toSqliteParams(params))) {
        yield row;
      }
    },
  };
}

function createPgStatement(pool: Pool, sql: string): Statement {
  const pgSql = toPgSql(sql);
  return {
    run: async (...params: any[]) => {
      const client = await pool.connect();
      try {
        const trimmed = pgSql.trim().toUpperCase();
        const withReturning = trimmed.startsWith("INSERT") && !/RETURNING\s/i.test(pgSql) ? pgSql + " RETURNING id" : pgSql;
        const result = await client.query(withReturning, params);
        return { changes: result.rowCount ?? 0, lastInsertRowid: result.rows[0]?.id ?? 0 };
      } finally {
        client.release();
      }
    },
    get: async (...params: any[]) => {
      const client = await pool.connect();
      try {
        // Only append LIMIT 1 when the query does not already have a LIMIT.
        const finalSql = withLimit1(pgSql);
        const result = await client.query(finalSql, params);
        return result.rows[0] ?? null;
      } finally {
        client.release();
      }
    },
    all: async (...params: any[]) => {
      const client = await pool.connect();
      try {
        const result = await client.query(pgSql, params);
        return result.rows;
      } finally {
        client.release();
      }
    },
    iterate: async function* (...params: any[]) {
      const client = await pool.connect();
      try {
        const result = await client.query(pgSql, params);
        for (const row of result.rows) {
          yield row;
        }
      } finally {
        client.release();
      }
    },
  };
}

function getClient(): DatabaseClient {
  if (isProduction && databaseUrl?.startsWith('postgres')) {
    const pool = getPgPool();
    return {
      prepare: (sql: string) => createPgStatement(pool, sql),
      exec: async (sql: string) => {
        const client = await pool.connect();
        try {
          await client.query(sql);
        } finally {
          client.release();
        }
      },
      close: async () => {
        await pool.end();
        pgPool = null;
      },
    };
  } else {
    const db = getSQLiteDb();
    return {
      prepare: (sql: string) => createSQLiteStatement(db, sql),
      exec: async (sql: string) => { db.exec(sql); },
      close: async () => {
        db.close();
        sqliteDb = null;
      },
    };
  }
}

// Export singleton client
export const db = getClient();

// Schema initialization for both databases
export async function initDatabase() {
  const client = getClient();
  
  if (isProduction && databaseUrl?.startsWith('postgres')) {
    // PostgreSQL schema
    await client.exec(`
      CREATE TABLE IF NOT EXISTS payouts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        vendor_name TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        currency TEXT NOT NULL,
        status TEXT NOT NULL,
        paypal_payout_batch_id TEXT,
        confidence REAL,
        requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
        approved_by TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        notes TEXT,
        receiver TEXT,
        decision_id TEXT
      );
      CREATE TABLE IF NOT EXISTS decisions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        module TEXT NOT NULL,
        action_type TEXT NOT NULL,
        context_json JSONB,
        features_json JSONB,
        confidence REAL NOT NULL,
        threshold REAL NOT NULL,
        decision TEXT NOT NULL,
        requires_approval BOOLEAN NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        narration TEXT
      );
      CREATE TABLE IF NOT EXISTS outcomes (
        id SERIAL PRIMARY KEY,
        decision_id UUID NOT NULL REFERENCES decisions(id),
        outcome TEXT NOT NULL,
        observed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
  } else {
    // SQLite schema (existing)
    await client.exec(`
      CREATE TABLE IF NOT EXISTS payouts (
        id TEXT PRIMARY KEY,
        vendor_name TEXT NOT NULL,
        amount_cents INTEGER NOT NULL,
        currency TEXT NOT NULL,
        status TEXT NOT NULL,
        paypal_payout_batch_id TEXT,
        confidence REAL,
        requires_approval INTEGER DEFAULT 0,
        approved_by TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        notes TEXT
      );
      CREATE TABLE IF NOT EXISTS decisions (
        id TEXT PRIMARY KEY,
        module TEXT NOT NULL,
        action_type TEXT NOT NULL,
        context_json TEXT,
        features_json TEXT,
        confidence REAL NOT NULL,
        threshold REAL NOT NULL,
        decision TEXT NOT NULL,
        requires_approval INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        narration TEXT
      );
      CREATE TABLE IF NOT EXISTS outcomes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        decision_id TEXT NOT NULL,
        outcome TEXT NOT NULL,
        observed_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(decision_id) REFERENCES decisions(id)
      );
    `);
    
    // Migration columns for SQLite
    try { await client.exec(`ALTER TABLE payouts ADD COLUMN receiver TEXT`); } catch {}
    try { await client.exec(`ALTER TABLE payouts ADD COLUMN decision_id TEXT`); } catch {}
    try { await client.exec(`ALTER TABLE decisions ADD COLUMN narration TEXT`); } catch {}
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('[DB] Shutting down...');
  if (pgPool) {
    await pgPool.end();
  }
  if (sqliteDb) {
    sqliteDb.close();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[DB] Shutting down...');
  if (pgPool) {
    await pgPool.end();
  }
  if (sqliteDb) {
    sqliteDb.close();
  }
  process.exit(0);
});