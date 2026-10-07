import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { can, projectAccess, taskAccess } from '@/lib/access';
import { getCurrentUser } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { MAX_ATTACHMENT_BYTES } from '@/lib/storage';

/*
 * Issues short-lived Vercel Blob client-upload tokens, so a browser can upload an attachment
 * straight to Blob (function request bodies are capped at 4.5 MB). The token is only issued
 * to someone who may comment on the task, and only for a path inside that task's folder.
 * The file is verified and recorded afterwards by registerBlobAttachmentAction.
 *
 * Reference files on a project suggestion use the same route with { suggestionId }: only the
 * suggestion's author gets a token, for its own folder (registerSuggestionBlobAction records it).
 */
export async function POST(request: Request) {
    const body = (await request.json()) as HandleUploadBody;

    try {
        const result = await handleUpload({
            body,
            request,
            onBeforeGenerateToken: async (pathname, clientPayload) => {
                const user = await getCurrentUser();
                if (!user || !user.isActive) throw new Error('Please sign in again.');

                const payload = JSON.parse(clientPayload ?? '{}') as { taskId?: unknown; suggestionId?: unknown };
                let folder: string;
                if (payload.suggestionId !== undefined) {
                    const suggestionId = Number(payload.suggestionId);
                    const [suggestion] = Number.isInteger(suggestionId) ? await db().select().from(schema.projectSuggestions).where(eq(schema.projectSuggestions.id, suggestionId)) : [];
                    const access = suggestion ? await projectAccess(suggestion.projectId) : null;
                    if (!suggestion || !access || suggestion.userId !== user.id || !can.viewProject(user, access)) throw new Error('You cannot upload files to this suggestion.');
                    folder = `suggestion-${suggestionId}`;
                } else {
                    const taskId = Number(payload.taskId);
                    const access = Number.isInteger(taskId) ? await taskAccess(taskId) : null;
                    if (!access || !can.comment(user, access)) throw new Error('You cannot upload files to this task.');
                    folder = `task-${taskId}`;
                }
                if (!pathname.startsWith(`attachments/${folder}/`) || pathname.includes('..')) throw new Error('Invalid upload path.');

                return {
                    // A first gate only — the server re-checks the actual content after upload.
                    allowedContentTypes: [
                        'image/jpeg',
                        'image/png',
                        'image/gif',
                        'image/webp',
                        'application/pdf',
                        'application/msword',
                        'application/vnd.ms-excel',
                        'application/vnd.ms-powerpoint',
                        'application/vnd.openxmlformats-officedocument.*',
                        'application/zip',
                        'application/x-zip-compressed',
                        'text/plain',
                        'text/csv',
                        'application/octet-stream',
                    ],
                    maximumSizeInBytes: MAX_ATTACHMENT_BYTES,
                    addRandomSuffix: true,
                    tokenPayload: JSON.stringify({ userId: user.id, folder }),
                };
            },
        });
        return NextResponse.json(result);
    } catch (error) {
        return NextResponse.json({ error: (error as Error).message }, { status: 400 });
    }
}
