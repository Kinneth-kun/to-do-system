import './lib/env';
import { ensureDatabase } from './lib/local-db';

/*
 * The 08:00 briefing, on demand (artisan taskflow:daily-digest):
 *
 *   npm run digest                       send to everyone due a briefing
 *   npm run digest -- --dry-run          show what would be sent, write nothing
 *   npm run digest -- --user=maria       only this id, username or email
 *   npm run digest -- --force            send again even if today's already went out
 */

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const user = args.find((a) => a.startsWith('--user='))?.slice('--user='.length);

const database = await ensureDatabase({ quiet: true });
const { closeDb } = await import('../src/lib/db');
const { sendDailyDigest } = await import('../src/lib/services/digest');

try {
    const result = await sendDailyDigest({ dryRun: flag('dry-run'), force: flag('force'), user });
    console.log(result.lines.join('\n'));
} finally {
    await closeDb();
    await database.stop();
}
