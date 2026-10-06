import { asc, eq } from 'drizzle-orm';
import { db, schema } from '.';
import { logActivity } from '../activity';
import { addDays, fromZoned, now, setTestNow, today } from '../dates';
import { ROLE_ADMIN, type Department } from '../enums';
import { loadTaskInfo, Notify } from '../notifications';
import { DeadlineService } from '../services/deadlines';
import { ProjectService } from '../services/projects';
import { TaskService, type Actor, type TaskRow } from '../services/tasks';
import { createUser } from '../users';

/*
 * Optional demo content: seven sample people and five projects with realistic, back-dated
 * history. Never run by default — `npm run db:seed-demo`.
 */

type Person = Actor & { id: number };

/** Run `fn` as if it were `days` from today, so history gets realistic timestamps. */
async function at<T>(days: number, fn: () => Promise<T>): Promise<T> {
    const base = today();
    setTestNow(fromZoned(addDays(base, days), 9 + (Math.abs(days) % 8), (Math.abs(days) * 7) % 60));
    try {
        return await fn();
    } finally {
        setTestNow(null);
    }
}

const d = (days: number) => addDays(today(), days);

async function comment(task: TaskRow, user: Person, body: string): Promise<void> {
    const [row] = await db().insert(schema.taskComments).values({ taskId: task.id, userId: user.id, body, createdAt: now(), updatedAt: now() }).returning();
    await logActivity('comment.added', `${user.name} commented on "${task.title}"`, { type: 'task', id: task.id }, {}, user.id);
    await Notify.mentions(body, await loadTaskInfo(task.id), { type: 'task_comment', id: row.id }, user);
}

export async function seedDemo(): Promise<void> {
    const [adminRow] = await db()
        .select({ id: schema.users.id, name: schema.users.name })
        .from(schema.users)
        .innerJoin(schema.roles, eq(schema.roles.id, schema.users.roleId))
        .where(eq(schema.roles.name, ROLE_ADMIN))
        .orderBy(asc(schema.users.id))
        .limit(1);
    if (!adminRow) throw new Error('Create the administrator first: set ADMIN_* in .env.local and run `npm run db:seed`.');
    const admin: Person = adminRow;

    const [existing] = await db().select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.username, 'maria')).limit(1);
    if (existing) throw new Error('Demo data is already present.');

    const specs: [string, string, string, Department, string][] = [
        ['Maria Santos', 'maria', 'Project Manager', 'operations', 'violet'],
        ['James Carter', 'james', 'Software Engineer', 'information_technology', 'sky'],
        ['Aisha Rahman', 'aisha', 'UX Designer', 'marketing', 'rose'],
        ['Daniel Kim', 'daniel', 'Financial Analyst', 'accounting', 'emerald'],
        ['Sofia Reyes', 'sofia', 'Leasing Officer', 'leasing', 'amber'],
        ["Liam O'Brien", 'liam', 'Security Supervisor', 'security', 'teal'],
        ['Grace Lee', 'grace', 'HR Coordinator', 'human_resources', 'fuchsia'],
    ];
    const people: Record<string, Person> = {};
    for (const [name, username, jobTitle, department, avatarColor] of specs) {
        const user = await createUser({ name, username, email: `${username}@taskflow.test`, jobTitle, department, avatarColor, password: 'password', emailVerifiedAt: now() });
        people[username] = { id: user.id, name: user.name };
    }
    const { maria, james, aisha, daniel, sofia, liam, grace } = people;
    const update = TaskService.applyUpdate;

    /* ------------------------------------------------------------------ 1. Customer Portal (at risk) */
    const portal = await at(-40, async () => {
        const p = await ProjectService.create(
            {
                name: 'Customer Portal Launch',
                description: 'Self-service portal where customers can track orders, download invoices and raise support tickets.',
                ownerId: maria.id,
                priority: 'high',
                color: 'indigo',
                startDate: d(0),
                dueDate: d(60),
                memberIds: [james.id, aisha.id, liam.id],
            },
            maria,
        );
        return {
            p,
            design: await TaskService.create({ projectId: p.id, title: 'UX research & wireframes', assigneeId: aisha.id, priority: 'high', startDate: d(0), dueDate: d(14) }, maria),
            build: await TaskService.create({ projectId: p.id, title: 'Build portal front-end', assigneeId: james.id, priority: 'high', startDate: d(10), dueDate: d(45), collaboratorIds: [aisha.id] }, maria),
            api: await TaskService.create({ projectId: p.id, title: 'Order tracking API integration', assigneeId: james.id, priority: 'urgent', startDate: d(5), dueDate: d(35) }, maria),
            qa: await TaskService.create({ projectId: p.id, title: 'End-to-end QA test plan', assigneeId: liam.id, priority: 'medium', startDate: d(30), dueDate: d(55) }, maria),
        };
    });
    await at(-34, () => update(portal.design.id, aisha, null, 40, 'Interviewed 8 customers; notes are in the project folder.'));
    await at(-31, () => update(portal.design.id, aisha, null, 75, 'Low-fidelity wireframes done.'));
    await at(-27, () => update(portal.design.id, maria, 'completed', null, 'Stakeholder review passed — signed off.'));

    await at(-28, () => update(portal.api.id, james, null, 20, 'Auth handshake with the order service is working.'));
    await at(-18, () => update(portal.api.id, james, null, 45, 'Blocked on staging credentials from the vendor. @maria can you chase?'));
    await at(-17, () => comment(portal.api, maria, 'Escalated to the vendor account manager — expecting credentials by Friday.'));
    await at(-20, () => update(portal.build.id, james, null, 15, 'Component library set up.'));
    await at(-6, () => update(portal.build.id, james, null, 35, 'Dashboard and order list pages done.'));
    await at(-5, () => comment(portal.build, aisha, '@james the order list looks great. Small note: the status chips need more contrast.'));

    // The API task fell behind: its due date passes and it becomes Delayed.
    await db().update(schema.tasks).set({ dueDate: addDays(today(), -3) }).where(eq(schema.tasks.id, portal.api.id));

    /* ------------------------------------------------------------------ 2. Office Relocation (on track) */
    const office = await at(-20, async () => {
        const p = await ProjectService.create(
            {
                name: 'Head Office Relocation',
                description: 'Move 60 staff to the new Riverside office with zero downtime.',
                ownerId: grace.id,
                priority: 'medium',
                color: 'emerald',
                startDate: d(0),
                dueDate: d(50),
                memberIds: [daniel.id, sofia.id],
            },
            grace,
        );
        return {
            p,
            lease: await TaskService.create({ projectId: p.id, title: 'Sign lease & floor plan', assigneeId: grace.id, priority: 'high', startDate: d(0), dueDate: d(10) }, grace),
            it: await TaskService.create({ projectId: p.id, title: 'IT network & desk setup', assigneeId: daniel.id, priority: 'high', startDate: d(12), dueDate: d(40) }, grace),
            comms: await TaskService.create({ projectId: p.id, title: 'Staff move communications', assigneeId: sofia.id, startDate: d(15), dueDate: d(22) }, grace),
        };
    });
    await at(-15, () => update(office.lease.id, grace, null, 60, 'Lease terms agreed, legal reviewing.'));
    await at(-11, () => update(office.lease.id, grace, 'completed', null, 'Lease signed. Floor plan approved by leadership.'));
    await at(-4, () => update(office.it.id, daniel, null, 40, 'Cabling complete on level 2.'));
    await at(-2, () => update(office.comms.id, sofia, null, 70, 'FAQ and move-day schedule drafted.'));
    await at(-1, () => TaskService.addCollaborator(office.comms.id, grace.id, grace));

    /* ------------------------------------------------------------------ 3. Q3 Brand Campaign (delayed, overdue project) */
    const campaign = await at(-75, async () => {
        const p = await ProjectService.create(
            {
                name: 'Q3 Brand Campaign',
                description: 'Multi-channel campaign for the autumn product line.',
                ownerId: sofia.id,
                priority: 'high',
                color: 'rose',
                startDate: d(0),
                dueDate: d(70),
                memberIds: [aisha.id, daniel.id],
            },
            sofia,
        );
        return {
            p,
            creative: await TaskService.create({ projectId: p.id, title: 'Campaign creative assets', assigneeId: aisha.id, priority: 'high', startDate: d(0), dueDate: d(40) }, sofia),
            media: await TaskService.create({ projectId: p.id, title: 'Media buying plan', assigneeId: sofia.id, priority: 'medium', startDate: d(20), dueDate: d(55) }, sofia),
            report: await TaskService.create({ projectId: p.id, title: 'Campaign performance dashboard', assigneeId: daniel.id, priority: 'low', startDate: d(40), dueDate: d(68) }, sofia),
        };
    });
    await at(-60, () => update(campaign.creative.id, aisha, null, 30, 'Moodboards approved.'));
    await at(-40, () => update(campaign.creative.id, aisha, null, 100, 'All assets delivered.'));
    await at(-30, () => update(campaign.media.id, sofia, null, 60, 'Negotiating rates with two publishers.'));
    await at(-12, () => update(campaign.report.id, daniel, null, 25, 'Waiting on ad platform data export.'));
    await at(-8, () => update(campaign.media.id, sofia, 'on_hold', null, 'Budget approval pending from finance.'));

    /* ------------------------------------------------------------------ 4. Onboarding revamp (completed) */
    const onboarding = await at(-90, async () => {
        const p = await ProjectService.create(
            {
                name: 'Employee Onboarding Revamp',
                description: 'New-hire checklist, buddy program and first-week schedule.',
                ownerId: grace.id,
                priority: 'low',
                color: 'fuchsia',
                startDate: d(0),
                dueDate: d(45),
                memberIds: [maria.id],
            },
            grace,
        );
        return {
            p,
            t1: await TaskService.create({ projectId: p.id, title: 'New-hire checklist', assigneeId: grace.id, dueDate: d(20) }, grace),
            t2: await TaskService.create({ projectId: p.id, title: 'Buddy program guidelines', assigneeId: maria.id, dueDate: d(35) }, grace),
        };
    });
    await at(-70, () => update(onboarding.t1.id, grace, 'completed', null, 'Checklist live in the HR portal.'));
    await at(-55, () => update(onboarding.t2.id, maria, 'completed', null, 'Guidelines published.'));
    await at(-50, () => ProjectService.update(onboarding.p.id, { status: 'completed' }, grace));

    /* ------------------------------------------------------------------ 5. Finance Data Warehouse (on hold) */
    const warehouse = await at(-30, async () => {
        const p = await ProjectService.create(
            {
                name: 'Finance Data Warehouse',
                description: 'Consolidate finance reporting sources into a single warehouse.',
                ownerId: daniel.id,
                priority: 'medium',
                color: 'sky',
                startDate: d(0),
                dueDate: d(120),
                memberIds: [james.id],
            },
            admin,
        );
        await TaskService.create({ projectId: p.id, title: 'Source system inventory', assigneeId: daniel.id, dueDate: d(20), progress: 80 }, daniel);
        await TaskService.create({ projectId: p.id, title: 'Warehouse schema design', assigneeId: james.id, dueDate: d(50) }, daniel);
        return p;
    });
    await at(-10, () => ProjectService.update(warehouse.id, { status: 'on_hold' }, admin));

    /* ------------------------------------------------------------------ Today-ish work so dashboards are lively */
    await at(-1, async () => {
        await TaskService.create({ projectId: portal.p.id, title: 'Prepare demo for steering committee', assigneeId: maria.id, priority: 'urgent', dueDate: d(2), collaboratorIds: [james.id] }, maria);
        await TaskService.create({ projectId: portal.p.id, title: 'Accessibility audit', assigneeId: liam.id, priority: 'medium', dueDate: d(3) }, maria);
        await TaskService.create({ projectId: office.p.id, title: 'Order furniture for level 3', assigneeId: daniel.id, priority: 'medium', dueDate: d(1) }, admin);
        await db()
            .insert(schema.projectMembers)
            .values({ projectId: office.p.id, userId: admin.id, role: 'member', addedBy: grace.id, createdAt: now(), updatedAt: now() })
            .onConflictDoNothing();
    });

    for (const user of [admin, maria, james, aisha]) {
        await logActivity('auth.login', `${user.name} signed in`, { type: 'user', id: user.id }, {}, user.id);
    }

    // Bring statuses, reminders and health up to date for "today".
    await DeadlineService.run();
}
