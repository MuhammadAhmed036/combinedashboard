import { Pool } from "pg";

let pool: Pool | null = null;

/** Lazily-created, module-wide singleton pool reading `DATABASE_URL`. */
export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not configured");
    pool = new Pool({ connectionString });
  }
  return pool;
}
