import { eq } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';
import { can, projectAccess, taskAccess } from '@/lib/access';
import { getCurrentUser } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { openStoredFile } from '@/lib/storage';

/**
 * Download an attachment after checking the person may see its task (or, for a suggestion's
 * reference file, its project). The file streams through here, so storage URLs (private Blob or
 * local disk) are never exposed. ?inline=1 shows an image in the browser instead of saving it.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user || !user.isActive) return NextResponse.redirect(new URL('/login', request.url));

    const id = Number((await params).id);
    const [attachment] = Number.isInteger(id) ? await db().select().from(schema.attachments).where(eq(schema.attachments.id, id)) : [];
    if (!attachment) return new NextResponse('Not Found', { status: 404 });

    if (attachment.attachableType === 'task') {
        const access = await taskAccess(attachment.attachableId);
        if (!access) return new NextResponse('Not Found', { status: 404 });
        if (!can.viewTask(user, access)) return new NextResponse('Forbidden', { status: 403 });
    } else if (attachment.attachableType === 'project_suggestion') {
        const [suggestion] = await db().select({ projectId: schema.projectSuggestions.projectId }).from(schema.projectSuggestions).where(eq(schema.projectSuggestions.id, attachment.attachableId));
        const access = suggestion ? await projectAccess(suggestion.projectId) : null;
        if (!access) return new NextResponse('Not Found', { status: 404 });
        if (!can.viewProject(user, access)) return new NextResponse('Forbidden', { status: 403 });
    } else {
        return new NextResponse('Not Found', { status: 404 });
    }

    const file = await openStoredFile(attachment.disk, attachment.path);
    if (!file) return new NextResponse('The file is no longer available.', { status: 404 });

    const inline = request.nextUrl.searchParams.get('inline') === '1' && (attachment.mimeType ?? '').startsWith('image/');
    const ascii = attachment.originalName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    return new NextResponse(file.stream, {
        headers: {
            'Content-Type': attachment.mimeType || 'application/octet-stream',
            'Content-Length': String(file.size),
            'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'private, no-store',
        },
    });
}
