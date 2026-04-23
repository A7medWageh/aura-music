import { Pool, QueryResultRow } from "pg";
import { getEnv } from "@/services/config/env";

let pool: Pool | null = null;

export function getNeonPool(): Pool {
  if (pool) return pool;
  const env = getEnv();

  pool = new Pool({
    host: env.NEON_DB_HOST,
    port: env.NEON_DB_PORT,
    user: env.NEON_DB_USERNAME,
    password: env.NEON_DB_PASSWORD,
    database: env.NEON_DB_NAME,
    max: env.NEON_DB_POOL_MAX,
    idleTimeoutMillis: env.NEON_DB_IDLE_TIMEOUT_MS,
    ssl: env.NEON_DB_SSL === "true" ? { rejectUnauthorized: false } : false
  });

  return pool;
}

export async function query<T extends QueryResultRow>(text: string, params: unknown[] = []) {
  return getNeonPool().query<T>(text, params);
}
