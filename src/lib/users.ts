import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import { db, schema } from './db';
import { AVATAR_COLORS, FULL_ACCESS_ROLES, ROLE_ADMIN, ROLE_EXECUTIVE, ROLE_USER, type Department, type RoleName } from './enums';
import { now } from './dates';
import { hashPassword } from './auth/password';

export type UserRow = typeof schema.users.$inferSelect;

/** A user as views need them (never includes the password hash). */
export type UserLite = {
    id: number;
    name: string;
    username: string;
    jobTitle: string | null;
    department: Department | null;
    avatarColor: string;
};

export const userLiteColumns = {
    id: schema.users.id,
    name: schema.users.name,
    username: schema.users.username,
    jobTitle: schema.users.jobTitle,
    department: schema.users.department,
    avatarColor: schema.users.avatarColor,
};

export function initials(name: string): string {
    const result = name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]!.toUpperCase())
        .join('');
    return result || '?';
}

export function firstName(name: string): string {
    return name.split(' ')[0] || name;
}

export async function usersByIds(ids: number[]): Promise<Map<number, UserLite>> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return new Map();
    const rows = await db().select(userLiteColumns).from(schema.users).where(inArray(schema.users.id, unique));
    return new Map(rows.map((u) => [u.id, u as UserLite]));
}

export async function activeUsers(): Promise<UserLite[]> {
    const rows = await db().select(userLiteColumns).from(schema.users).where(eq(schema.users.isActive, true)).orderBy(schema.users.name);
    return rows as UserLite[];
}

/* ------------------------------------------------------------------ Roles */

const ROLE_DEFAULTS = {
    [ROLE_ADMIN]: {
        label: 'Administrator',
        description: 'Full access: user management, oversight of all projects, activity logs, executive dashboard and settings.',
    },
    [ROLE_EXECUTIVE]: {
        label: 'Executive',
        description: 'Oversight of all projects and tasks, the executive dashboard and activity logs — without Meeting Mode, user management or settings.',
    },
    [ROLE_USER]: {
        label: 'User',
        description: 'Manages assigned work, creates projects and tasks, and collaborates with others.',
    },
};

/** The id of a role, creating the role on first use (Role::idFor). */
export async function roleId(name: RoleName): Promise<number> {
    const existing = await db().select({ id: schema.roles.id }).from(schema.roles).where(eq(schema.roles.name, name)).limit(1);
    if (existing[0]) return existing[0].id;
    const [row] = await db()
        .insert(schema.roles)
        .values({ name, ...ROLE_DEFAULTS[name] })
        .onConflictDoUpdate({ target: schema.roles.name, set: { name } })
        .returning({ id: schema.roles.id });
    return row.id;
}

/** Administrators and executives — they already see every task, so they're never collaborators. */
export async function isFullAccessUser(userId: number): Promise<boolean> {
    const rows = await db()
        .select({ name: schema.roles.name })
        .from(schema.users)
        .innerJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
        .where(eq(schema.users.id, userId))
        .limit(1);
    return !!rows[0] && FULL_ACCESS_ROLES.includes(rows[0].name as RoleName);
}

export async function isAdminUser(userId: number): Promise<boolean> {
    const rows = await db()
        .select({ name: schema.roles.name })
        .from(schema.users)
        .innerJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
        .where(eq(schema.users.id, userId))
        .limit(1);
    return rows[0]?.name === ROLE_ADMIN;
}

/* ------------------------------------------------------------------ Creation */

function crc32(value: string): number {
    let crc = 0xffffffff;
    for (const byte of new TextEncoder().encode(value)) {
        crc ^= byte;
        for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    return (crc ^ 0xffffffff) >>> 0;
}

export async function generateUsername(seed: string, ignoreId?: number): Promise<string> {
    const base =
        seed
            .normalize('NFKD')
            .replace(/[̀-ͯ]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '.')
            .replace(/^\.+|\.+$/g, '')
            .slice(0, 24) || 'user';
    let username = base;
    let i = 1;
    while (await usernameTaken(username, ignoreId)) {
        username = `${base}${++i}`;
    }
    return username;
}

export async function usernameTaken(username: string, ignoreId?: number): Promise<boolean> {
    const rows = await db()
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(and(sql`lower(${schema.users.username}) = lower(${username})`, ignoreId ? ne(schema.users.id, ignoreId) : undefined))
        .limit(1);
    return rows.length > 0;
}

export async function emailTaken(email: string, ignoreId?: number): Promise<boolean> {
    const rows = await db()
        .select({ id: schema.users.id })
        .from(schema.users)
        .where(and(sql`lower(${schema.users.email}) = lower(${email})`, ignoreId ? ne(schema.users.id, ignoreId) : undefined))
        .limit(1);
    return rows.length > 0;
}

export type NewUser = {
    name: string;
    email: string;
    password: string;
    username?: string | null;
    roleId?: number;
    jobTitle?: string | null;
    department?: Department | null;
    avatarColor?: string | null;
    isActive?: boolean;
    emailVerifiedAt?: Date | null;
};

/** Create a user, filling username / avatar colour / role the way the Laravel model did. */
export async function createUser(data: NewUser): Promise<UserRow> {
    const username = data.username?.trim() || (await generateUsername(data.name || data.email.split('@')[0]));
    const avatarColor = data.avatarColor || AVATAR_COLORS[crc32(data.email) % AVATAR_COLORS.length];
    const [user] = await db()
        .insert(schema.users)
        .values({
            roleId: data.roleId ?? (await roleId(ROLE_USER)),
            name: data.name,
            username,
            email: data.email,
            jobTitle: data.jobTitle ?? null,
            department: data.department ?? null,
            avatarColor,
            isActive: data.isActive ?? true,
            emailVerifiedAt: data.emailVerifiedAt ?? null,
            password: await hashPassword(data.password),
            createdAt: now(),
            updatedAt: now(),
        })
        .returning();
    return user;
}
