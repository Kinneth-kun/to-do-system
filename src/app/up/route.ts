import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

/** Health check (Laravel's /up): 200 when the app can reach its database. */
export async function GET() {
    try {
        await db().execute(sql`select 1`);
        return NextResponse.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
        return NextResponse.json({ status: 'unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
}
