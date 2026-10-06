import bcrypt from 'bcryptjs';

const ROUNDS = Number(process.env.BCRYPT_ROUNDS ?? 12);

export function hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, ROUNDS);
}

/**
 * Hashes from the Laravel app use PHP's "$2y$" prefix; the algorithm is identical to "$2b$",
 * so existing accounts keep working if their rows are carried over.
 */
export function verifyPassword(plain: string, hash: string | null | undefined): Promise<boolean> {
    if (!hash) return Promise.resolve(false);
    return bcrypt.compare(plain, hash.replace(/^\$2y\$/, '$2b$'));
}

/** Laravel's Password::min(8)->letters()->numbers(). Returns an error message or null. */
export function passwordRuleError(password: string, field = 'password'): string | null {
    if (password.length < 8) return `The ${field} field must be at least 8 characters.`;
    if (!/\p{L}/u.test(password)) return `The ${field} field must contain at least one letter.`;
    if (!/\p{N}/u.test(password)) return `The ${field} field must contain at least one number.`;
    return null;
}
