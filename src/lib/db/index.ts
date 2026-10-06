import { AsyncLocalStorage } from 'node:async_hooks';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;

/*
 * One pool per process (kept on globalThis so dev hot reloads and Next's separate module graphs
 * share it). Created lazily: `next build` imports this module without a database.
 *
 * Locally the database is embedded PGlite behind a socket server, which serves one connection at
 * a time — so the pool is capped at 1 there and releases idle connections quickly, letting CLI
 * scripts connect while `npm run dev` is running.
 */
type Globals = { __taskflowPool?: Pool; __taskflowDb?: Db };
const g = globalThis as Globals;

function isEmbedded(url: string): boolean {
    return process.env.TASKFLOW_EMBEDDED_DB === '1' || /@(127\.0\.0\.1|localhost):5433\//.test(url);
}

function createPool(): Pool {
    const url = process.env.DATABASE_URL;
    if (!url) {
        throw new Error('DATABASE_URL is not set. Run `npm run dev` (which starts a local database) or set it in .env.local.');
    }
    const embedded = isEmbedded(url);
    const pool = new Pool({
        connectionString: url,
        max: embedded ? 1 : Number(process.env.DB_POOL_MAX ?? 10),
        idleTimeoutMillis: embedded ? 1000 : 10_000,
        connectionTimeoutMillis: embedded ? 30_000 : 10_000,
    });
    pool.on('error', (err) => console.error('[db] idle client error', err.message));

    // On Vercel Fluid compute, release idle connections before the instance is suspended.
    if (process.env.VERCEL) {
        import('@vercel/functions')
            .then(({ attachDatabasePool }) => attachDatabasePool(pool))
            .catch(() => {});
    }
    return pool;
}

function root(): Db {
    if (!g.__taskflowDb) {
        g.__taskflowPool ??= createPool();
        g.__taskflowDb = drizzle(g.__taskflowPool, { schema });
    }
    return g.__taskflowDb;
}

const txStorage = new AsyncLocalStorage<Db>();

/**
 * The current database handle: the open transaction when called inside `transaction()`,
 * otherwise the pool. Services always go through this, so nested service calls join the
 * caller's transaction the way Laravel's DB::transaction nesting did.
 */
export function db(): Db {
    return txStorage.getStore() ?? root();
}

export async function transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (txStorage.getStore()) return fn();
    return root().transaction((tx) => txStorage.run(tx as unknown as Db, fn));
}

export async function closeDb(): Promise<void> {
    const pool = g.__taskflowPool;
    g.__taskflowPool = undefined;
    g.__taskflowDb = undefined;
    await pool?.end();
}

export { schema };
