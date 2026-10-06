import 'server-only';
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { fileTypeFromBuffer } from 'file-type';

/*
 * Attachment storage.
 *
 *  - On Vercel (BLOB_READ_WRITE_TOKEN set): private Vercel Blob. Browsers upload straight to Blob
 *    — function request bodies are capped at 4.5 MB, below the 10 MB attachment limit — and
 *    downloads stream through /attachments/[id] after an authorization check, so a blob URL is
 *    never handed to anyone.
 *  - Locally: files under .data/uploads.
 *
 * Either way the stored type is detected from the file's contents, never taken from the browser.
 */

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'zip'];

/** Content-detected types we accept, by file-type's extension. */
const ACCEPTED_DETECTED: Record<string, string> = {
    jpg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    pdf: 'application/pdf',
    cfb: 'application/msword', // legacy .doc / .xls / .ppt containers
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    zip: 'application/zip',
};

const LEGACY_OFFICE: Record<string, string> = { doc: 'application/msword', xls: 'application/vnd.ms-excel', ppt: 'application/vnd.ms-powerpoint' };

export const blobEnabled = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
export const blobAccess = (): 'public' | 'private' => (process.env.BLOB_ACCESS === 'public' ? 'public' : 'private');

const uploadsRoot = () => path.join(process.cwd(), '.data', 'uploads');

export const extensionOf = (name: string) => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '');

/** A filesystem- and URL-safe version of the original file name. */
export function safeFileName(name: string): string {
    const ext = extensionOf(name);
    const base = name
        .slice(0, ext ? -(ext.length + 1) : undefined)
        .normalize('NFKD')
        .replace(/[^\w.-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
    return `${base || 'file'}${ext ? `.${ext}` : ''}`;
}

/**
 * Detect the real type from the first bytes. Returns the MIME type to store, or null when the
 * content is not one of the accepted kinds (Laravel's `mimes:` rule).
 */
export async function detectType(head: Uint8Array, originalName: string): Promise<string | null> {
    const detected = await fileTypeFromBuffer(head);
    const ext = extensionOf(originalName);
    if (detected) {
        if (!(detected.ext in ACCEPTED_DETECTED)) return null;
        if (detected.ext === 'cfb') return LEGACY_OFFICE[ext] ?? ACCEPTED_DETECTED.cfb;
        return ACCEPTED_DETECTED[detected.ext];
    }
    // No binary signature: accept plain text only (no NUL bytes), as .txt / .csv.
    if (head.includes(0)) return null;
    return ext === 'csv' ? 'text/csv' : 'text/plain';
}

export async function saveLocal(taskId: number, originalName: string, bytes: Uint8Array): Promise<string> {
    const relative = path.posix.join('attachments', `task-${taskId}`, `${randomUUID()}-${safeFileName(originalName)}`);
    const absolute = path.join(uploadsRoot(), relative);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, bytes);
    return relative;
}

/** First bytes of a stored blob, for type detection after a client upload. */
export async function blobHead(pathname: string): Promise<{ head: Uint8Array; size: number } | null> {
    const { get } = await import('@vercel/blob');
    const result = await get(pathname, { access: blobAccess(), useCache: false });
    if (!result || result.statusCode !== 200) return null;
    const reader = result.stream.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    while (length < 4100) {
        const { value, done } = await reader.read();
        if (done || !value) break;
        chunks.push(value);
        length += value.length;
    }
    await reader.cancel().catch(() => {});
    const head = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        head.set(chunk, offset);
        offset += chunk.length;
    }
    return { head: head.slice(0, 4100), size: result.blob.size };
}

export async function openStoredFile(disk: string, filePath: string): Promise<{ stream: ReadableStream<Uint8Array>; size: number } | null> {
    if (disk === 'blob') {
        const { get } = await import('@vercel/blob');
        const result = await get(filePath, { access: blobAccess() });
        if (!result || result.statusCode !== 200) return null;
        return { stream: result.stream, size: result.blob.size };
    }

    const absolute = path.join(uploadsRoot(), filePath);
    if (!absolute.startsWith(uploadsRoot())) return null;
    try {
        const info = await stat(absolute);
        return { stream: Readable.toWeb(createReadStream(absolute)) as ReadableStream<Uint8Array>, size: info.size };
    } catch {
        return null;
    }
}

export async function deleteStoredFile(disk: string, filePath: string): Promise<void> {
    try {
        if (disk === 'blob') {
            const { del } = await import('@vercel/blob');
            await del(filePath);
        } else {
            const absolute = path.join(uploadsRoot(), filePath);
            if (absolute.startsWith(uploadsRoot())) await rm(absolute, { force: true });
        }
    } catch (error) {
        console.warn('Could not delete stored file', { disk, filePath, message: (error as Error).message });
    }
}

export function humanSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let i = 0;
    while (size >= 1024 && i < units.length - 1) {
        size /= 1024;
        i++;
    }
    return `${i ? Math.round(size * 10) / 10 : Math.round(size)} ${units[i]}`;
}
