import { Pool } from 'pg';

const globalPool = globalThis as typeof globalThis & { bingoPool?: Pool };
export function getPool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  if (!globalPool.bingoPool) globalPool.bingoPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 10000 });
  return globalPool.bingoPool;
}
