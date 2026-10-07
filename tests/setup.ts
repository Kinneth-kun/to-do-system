import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach } from 'vitest';

/*
 * Every test file gets its own in-memory Postgres (PGlite) served over the wire protocol, so
 * tests exercise the same `pg` driver and SQL as production. Tables are emptied before each
 * test — the equivalent of Laravel's RefreshDatabase.
 */

let pglite: PGlite;
let server: PGLiteSocketServer;

beforeAll(async () => {
    pglite = await PGlite.create();
    server = new PGLiteSocketServer({ db: pglite, port: 0, host: '127.0.0.1' });
    await server.start();
    process.env.DATABASE_URL = `postgres://postgres:postgres@${server.getServerConn()}/postgres`;
    process.env.TASKFLOW_EMBEDDED_DB = '1';

    const { runMigrations } = await import('@/lib/db/migrate');
    await runMigrations();
});

beforeEach(async () => {
    const { db } = await import('@/lib/db');
    const { Settings } = await import('@/lib/settings');
    const { setTestNow } = await import('@/lib/dates');
    await db().execute(sql`truncate table
        activity_logs, attachments, notifications, task_comments, task_updates, task_collaborators,
        tasks, project_members, projects, sessions, settings, locks, rate_limits, users, roles
        restart identity cascade`);
    Settings.flush();
    setTestNow(null);
});

afterAll(async () => {
    const { closeDb } = await import('@/lib/db');
    await closeDb();
    await server?.stop();
    await pglite?.close();
});
