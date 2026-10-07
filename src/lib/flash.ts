import 'server-only';
import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

/*
 * Flash messages — Laravel's `back()->with('success', '…')`. A short-lived cookie carries the
 * message to the next render, where the layout hands it to the toast stack, which then clears it.
 */

export const FLASH_COOKIE = 'taskflow_flash';

export type FlashType = 'success' | 'error' | 'warning';
export type FlashMessage = { id: string; type: FlashType; message: string };

export async function flash(type: FlashType, message: string): Promise<void> {
    const jar = await cookies();
    const existing = parseFlash(jar.get(FLASH_COOKIE)?.value);
    existing.push({ id: randomUUID(), type, message });
    jar.set(FLASH_COOKIE, encodeURIComponent(JSON.stringify(existing.slice(-4))), {
        path: '/',
        maxAge: 60,
        sameSite: 'lax',
        httpOnly: false, // the toast stack removes it once shown
        secure: process.env.NODE_ENV === 'production',
    });
}

export async function readFlash(): Promise<FlashMessage[]> {
    return parseFlash((await cookies()).get(FLASH_COOKIE)?.value);
}

export function parseFlash(value: string | undefined): FlashMessage[] {
    if (!value) return [];
    try {
        const parsed = JSON.parse(decodeURIComponent(value));
        return Array.isArray(parsed) ? parsed.filter((m) => m && typeof m.message === 'string') : [];
    } catch {
        return [];
    }
}

/** Flash a message and refresh every page's data (the "redirect back" of a Server Action). */
export async function done(type: FlashType, message: string): Promise<void> {
    await flash(type, message);
    revalidatePath('/', 'layout');
}
