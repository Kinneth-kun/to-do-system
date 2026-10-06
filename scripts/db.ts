import './lib/env';
import { sql } from 'drizzle-orm';
import { ensureDatabase } from './lib/local-db';

/*
 *   npm run db:migrate     apply pending migrations
 *   npm run db:seed        roles + the administrator from ADMIN_* (safe to re-run)
 *   npm run db:seed-demo   sample people, projects and history (opt-in)
 *   npm run db:reset       local database only: drop everything, migrate, seed
 *
 * `deploy` (migrate + seed) runs during the Vercel build — see vercel-build in package.json.
 */

const command = process.argv[2];
const commands = ['migrate', 'seed', 'seed-demo', 'reset', 'deploy'];
if (!commands.includes(command)) {
    console.error(`Usage: tsx scripts/db.ts <${commands.join('|')}>`);
    process.exit(1);
}

if (command === 'deploy' && !process.env.DATABASE_URL) {
    console.warn('DATABASE_URL is not set — skipping migrations. Connect a Postgres database (e.g. Neon) to the Vercel project.');
    process.exit(0);
}

const database = await ensureDatabase();
const { db, closeDb } = await import('../src/lib/db');
const { runMigrations } = await import('../src/lib/db/migrate');
const { seedBasics } = await import('../src/lib/db/seed');

try {
    if (command === 'reset') {
        if (!database.embedded) throw new Error('db:reset only runs against the local embedded database. Unset DATABASE_URL to use it.');
        await db().execute(sql`drop schema if exists public cascade`);
        await db().execute(sql`drop schema if exists drizzle cascade`);
        await db().execute(sql`create schema public`);
        console.log('Local database emptied.');
    }

    if (['migrate', 'reset', 'deploy'].includes(command)) {
        await runMigrations();
        console.log('Migrations applied.');
    }

    if (['seed', 'reset', 'deploy'].includes(command)) {
        await seedBasics();
    }

    if (command === 'seed-demo') {
        await runMigrations();
        const { seedDemo } = await import('../src/lib/db/demo');
        await seedDemo();
        console.log('Demo data created. Sample accounts use the password "password".');
    }
} catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
} finally {
    await closeDb();
    await database.stop();
}
