import { spawn } from 'node:child_process';
import { migrate } from './migrate.mjs';

if (!process.env.CALLER_PIN || process.env.CALLER_PIN.length < 8) {
  console.error('Set CALLER_PIN to a private passphrase of at least 8 characters.');
  process.exit(1);
}
let connected = false;
for (let attempt = 1; attempt <= 10; attempt++) {
  try { await migrate(); connected = true; break; }
  catch (error) {
    if (attempt === 10) throw error;
    console.log(`Waiting for PostgreSQL (${attempt}/10)…`);
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
}
if (!connected) process.exit(1);
const port = process.env.PORT || '3000';
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '0.0.0.0', '-p', port], { stdio: 'inherit', env: process.env });
process.on('SIGTERM', () => server.kill('SIGTERM'));
process.on('SIGINT', () => server.kill('SIGINT'));
server.on('exit', code => process.exit(code ?? 1));
