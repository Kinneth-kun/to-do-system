import './lib/env';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { ensureDatabase } from './lib/local-db';

/*
 * `npm run dev`   → database (embedded PGlite unless DATABASE_URL is set) + migrations + the
 *                   administrator from ADMIN_* + `next dev`
 * `npm run start` → the same, then `next start` (after `npm run build`)
 */

const mode = process.argv.includes('--start') ? 'start' : 'dev';

const database = await ensureDatabase();
const { runMigrations } = await import('../src/lib/db/migrate');
const { seedBasics } = await import('../src/lib/db/seed');
const { closeDb } = await import('../src/lib/db');

await runMigrations();
await seedBasics((line) => console.log(`  ${line}`));
// Release our connection: the embedded database serves one client at a time.
await closeDb();

const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
const args = [nextBin, mode, ...process.argv.slice(2).filter((a) => a !== '--start')];
const child = spawn(process.execPath, args, { stdio: 'inherit', env: process.env });

const shutdown = async (code: number) => {
    child.kill();
    await database.stop();
    process.exit(code);
};
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
child.on('exit', (code) => shutdown(code ?? 0));
