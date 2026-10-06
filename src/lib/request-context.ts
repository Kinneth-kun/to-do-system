/**
 * The caller's IP address and user agent, or nulls when there is no HTTP request (CLI scripts,
 * cron work, tests) — the equivalent of Laravel's app()->runningInConsole() check.
 */
export async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
    try {
        const { headers } = await import('next/headers');
        const h = await headers();
        const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim();
        const ip = forwarded || h.get('x-real-ip') || null;
        return { ip: ip ? ip.slice(0, 45) : null, userAgent: h.get('user-agent')?.slice(0, 500) ?? null };
    } catch {
        return { ip: null, userAgent: null };
    }
}
