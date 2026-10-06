import { sql } from 'drizzle-orm';
import { db } from './db';

/*
 * Cross-instance coordination in Postgres. Laravel used its cache store for these
 * (Cache::add, RateLimiter); on Vercel every request may land on a different instance, so the
 * state has to live in the database.
 */

/** Take a named lock for `seconds` unless someone else holds an unexpired one. */
export async function acquireLock(key: string, seconds: number): Promise<boolean> {
    const result = await db().execute(sql`
        insert into locks (key, expires_at) values (${key}, now() + make_interval(secs => ${seconds}))
        on conflict (key) do update set expires_at = excluded.expires_at
        where locks.expires_at < now()
        returning key`);
    return result.rows.length > 0;
}

export async function releaseLock(key: string): Promise<void> {
    await db().execute(sql`delete from locks where key = ${key}`);
}

/**
 * Count a hit against a fixed window. Returns whether the caller is still within `max` hits and
 * how many seconds until the window resets.
 */
export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<{ allowed: boolean; retryAfter: number }> {
    const result = await db().execute<{ hits: number; retry_after: number }>(sql`
        insert into rate_limits (key, hits, reset_at) values (${key}, 1, now() + make_interval(secs => ${windowSeconds}))
        on conflict (key) do update set
            hits = case when rate_limits.reset_at <= now() then 1 else rate_limits.hits + 1 end,
            reset_at = case when rate_limits.reset_at <= now() then excluded.reset_at else rate_limits.reset_at end
        returning hits, greatest(0, ceil(extract(epoch from (reset_at - now()))))::int as retry_after`);
    const row = result.rows[0];
    return { allowed: Number(row.hits) <= max, retryAfter: Number(row.retry_after) };
}

export async function clearRateLimit(key: string): Promise<void> {
    await db().execute(sql`delete from rate_limits where key = ${key}`);
}

/** Housekeeping: drop expired counters, locks and sessions. */
export async function pruneExpired(): Promise<void> {
    await db().execute(sql`delete from rate_limits where reset_at < now() - interval '1 hour'`);
    await db().execute(sql`delete from locks where expires_at < now() - interval '1 hour'`);
    await db().execute(sql`delete from sessions where expires_at < now()`);
}
