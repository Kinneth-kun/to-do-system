import { mkdirSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

/*
 * Zero-setup local database.
 *
 * When DATABASE_URL is not set, TaskFlow runs against PGlite — real Postgres compiled to
 * WebAssembly, stored in .data/pglite — exposed on 127.0.0.1:5433 over the normal Postgres wire
 * protocol. The app then uses exactly the same `pg` driver and SQL as it does on Vercel.
 *
 * If something (usually `npm run dev`) is already serving the local database, scripts connect
 * to it instead of opening the data directory a second time.
 */
export const LOCAL_DB_PORT = Number(process.env.LOCAL_DB_PORT ?? 5433);
export const LOCAL_DB_URL = `postgres://postgres:postgres@127.0.0.1:${LOCAL_DB_PORT}/postgres`;

function portInUse(port: number): Promise<boolean> {
    return new Promise((resolve) => {
        const socket = net.connect({ port, host: '127.0.0.1' });
        socket.once('connect', () => {
            socket.destroy();
            resolve(true);
        });
        socket.once('error', () => resolve(false));
    });
}

export type DatabaseHandle = { embedded: boolean; startedHere: boolean; stop: () => Promise<void> };

export async function ensureDatabase(options: { quiet?: boolean } = {}): Promise<DatabaseHandle> {
    if (process.env.DATABASE_URL) {
        return { embedded: false, startedHere: false, stop: async () => {} };
    }

    process.env.DATABASE_URL = LOCAL_DB_URL;
    process.env.TASKFLOW_EMBEDDED_DB = '1';

    if (await portInUse(LOCAL_DB_PORT)) {
        if (!options.quiet) console.log(`Using the local database already running on port ${LOCAL_DB_PORT}.`);
        return { embedded: true, startedHere: false, stop: async () => {} };
    }

    const { PGlite } = await import('@electric-sql/pglite');
    const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket');

    const dataDir = process.env.LOCAL_DB_DIR || path.join(process.cwd(), '.data', 'pglite');
    mkdirSync(dataDir, { recursive: true });

    const pg = await PGlite.create(dataDir);
    const server = new PGLiteSocketServer({ db: pg, port: LOCAL_DB_PORT, host: '127.0.0.1', maxConnections: 4 });
    await server.start();
    if (!options.quiet) console.log(`Local database (PGlite) ready on port ${LOCAL_DB_PORT} — data in ${path.relative(process.cwd(), dataDir) || dataDir}`);

    return {
        embedded: true,
        startedHere: true,
        stop: async () => {
            await server.stop();
            await pg.close();
        },
    };
}
