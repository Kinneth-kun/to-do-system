import { sql, type AnyColumn } from 'drizzle-orm';

/** Case-insensitive "contains", with % and _ in the user's text treated literally. */
export function contains(column: AnyColumn, text: string) {
    const escaped = text.replace(/[\\%_]/g, (c) => `\\${c}`);
    return sql`${column} ilike ${`%${escaped}%`}`;
}
