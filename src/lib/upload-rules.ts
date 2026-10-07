/*
 * Upload rules shared by the browser and the server (no server-only imports here). The server
 * still re-checks every file's real content type in lib/storage.ts.
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const UPLOAD_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'csv', 'zip'];
export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
/** Reference files on one suggestion. */
export const MAX_SUGGESTION_FILES = 5;

export const uploadAccept = UPLOAD_EXTENSIONS.map((e) => `.${e}`).join(',');
export const uploadExtension = (name: string) => (name.includes('.') ? name.split('.').pop()!.toLowerCase() : '');
/** A Blob-path-safe version of a file name. */
export const safeUploadName = (name: string) =>
    name
        .normalize('NFKD')
        .replace(/[^\w.-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(-100) || 'file';

export const UPLOAD_TYPE_ERROR = `The file field must be a file of type: ${UPLOAD_EXTENSIONS.join(', ')}.`;
export const UPLOAD_SIZE_ERROR = 'The file field must not be greater than 10240 kilobytes.';

/** Client-side check before uploading; null when the file is acceptable. */
export function uploadProblem(file: File): string | null {
    if (file.size > MAX_UPLOAD_BYTES) return `"${file.name}" is larger than 10 MB.`;
    if (!UPLOAD_EXTENSIONS.includes(uploadExtension(file.name))) return `"${file.name}" is not a supported file type.`;
    return null;
}
