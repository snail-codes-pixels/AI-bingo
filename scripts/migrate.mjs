import pg from 'pg';
import { pathToFileURL } from 'node:url';

export async function migrate() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 10000 });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE TABLE IF NOT EXISTS participants (
      id uuid PRIMARY KEY,
      joined_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS confessions (
      participant_id uuid NOT NULL REFERENCES participants(id),
      prompt_id text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (participant_id, prompt_id)
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS calls (
      id bigserial PRIMARY KEY,
      prompt_id text NOT NULL,
      started_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS call_answers (
      call_id bigint NOT NULL REFERENCES calls(id),
      participant_id uuid NOT NULL REFERENCES participants(id),
      answer text NOT NULL CHECK (answer IN ('yes', 'no')),
      PRIMARY KEY (call_id, participant_id)
    )`);
    await client.query(`CREATE TABLE IF NOT EXISTS winners (
      participant_id uuid PRIMARY KEY REFERENCES participants(id),
      display_name text NOT NULL,
      won_at timestamptz NOT NULL DEFAULT now()
    )`);
    await client.query('COMMIT');
    console.log('Database ready');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  migrate().catch(error => { console.error(error); process.exitCode = 1; });
}
