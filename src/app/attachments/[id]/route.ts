import { eq } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';
import { can, taskAccess } from '@/lib/access';
import { getCurrentUser } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { openStoredFile } from '@/lib/storage';

/**
 * Download an attachment after checking the person may see its task. The file streams through
 * here, so storage URLs (private Blob or local disk) are never exposed.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user || !user.isActive) return NextResponse.redirect(new URL('/login', request.url));

    const id = Number((await params).id);
    const [attachment] = Number.isInteger(id) ? await db().select().from(schema.attachments).where(eq(schema.attachments.id, id)) : [];
    if (!attachment || attachment.attachableType !== 'task') return new NextResponse('Not Found', { status: 404 });

    const access = await taskAccess(attachment.attachableId);
    if (!access) return new NextResponse('Not Found', { status: 404 });
    if (!can.viewTask(user, access)) return new NextResponse('Forbidden', { status: 403 });

    const file = await openStoredFile(attachment.disk, attachment.path);
    if (!file) return new NextResponse('The file is no longer available.', { status: 404 });

    const ascii = attachment.originalName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    return new NextResponse(file.stream, {
        headers: {
            'Content-Type': attachment.mimeType || 'application/octet-stream',
            'Content-Length': String(file.size),
            'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'private, no-store',
        },
    });
}
