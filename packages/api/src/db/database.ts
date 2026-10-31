/**
 * Dual-mode database client.
 * Uses PostgreSQL when DATABASE_URL is set, SQLite otherwise.
 * All queries use ? placeholders -- converted to $N for PostgreSQL.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---- Abstract interface ----

export interface DbClient {
  /** Return all matching rows. */
  all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T[]>;
  /** Return the first matching row, or undefined. */
  get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): Promise<T | undefined>;
  /** Execute a statement (INSERT/UPDATE/DELETE). */
  run(sql: string, ...params: unknown[]): Promise<void>;
  /** Execute raw SQL (schema init, multi-statement). */
  execSql(sql: string): Promise<void>;
  /** Shut down the connection. */
  close(): Promise<void>;
}

// ---- Parameter conversion ----

/** Convert ? placeholders to $1, $2, ... for PostgreSQL. */
function toPgParams(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// ---- PostgreSQL implementation ----

async function createPgClient(url: string): Promise<DbClient> {
  const { Pool } = await import('pg');
  const pool = new Pool({ connectionString: url });

  // Initialize schema
  const schema = readFileSync(join(__dirname, 'schema.pg.sql'), 'utf-8');
  await pool.query(schema);

  return {
    async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      const result = await pool.query(toPgParams(sql), params);
      return result.rows as T[];
    },
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      const result = await pool.query(toPgParams(sql), params);
      return result.rows[0] as T | undefined;
    },
    async run(sql: string, ...params: unknown[]): Promise<void> {
      await pool.query(toPgParams(sql), params);
    },
    async execSql(sql: string): Promise<void> {
      await pool.query(sql);
    },
    async close(): Promise<void> {
      await pool.end();
    },
  };
}

// ---- SQLite implementation ----

async function createSqliteClient(): Promise<DbClient> {
  const Database = (await import('better-sqlite3')).default;
  const dbPath = process.env.DB_PATH ?? join(__dirname, '../../data/guardianstream.db');
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Initialize schema
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);  // better-sqlite3 .exec() runs SQL, not shell commands

  return {
    async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
      return db.prepare(sql).all(...params) as T[];
    },
    async get<T>(sql: string, ...params: unknown[]): Promise<T | undefined> {
      return db.prepare(sql).get(...params) as T | undefined;
    },
    async run(sql: string, ...params: unknown[]): Promise<void> {
      db.prepare(sql).run(...params);
    },
    async execSql(sql: string): Promise<void> {
      db.exec(sql);  // better-sqlite3 .exec() runs SQL, not shell commands
    },
    async close(): Promise<void> {
      db.close();
    },
  };
}

// ---- Factory ----

let client: DbClient | null = null;

export async function initDb(): Promise<DbClient> {
  if (client) return client;

  const url = process.env.GS_DATABASE_URL;
  if (url) {
    console.log('[DB] Connecting to PostgreSQL...');
    client = await createPgClient(url);
  } else {
    console.log('[DB] Using SQLite (set GS_DATABASE_URL for PostgreSQL)');
    client = await createSqliteClient();
  }
  return client;
}

export function getDb(): DbClient {
  if (!client) throw new Error('Database not initialized. Call initDb() first.');
  return client;
}

export async function closeDb(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
  }
}
