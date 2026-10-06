import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, schema } from '@/lib/db';
import { addDays, today } from '@/lib/dates';
import { isProjectMember, projectAccess } from '@/lib/access';
import { ProjectService } from '@/lib/services/projects';
import { TaskService } from '@/lib/services/tasks';
import { DeadlineService } from '@/lib/services/deadlines';
import { Settings } from '@/lib/settings';
import { history, makeUser, notificationsFor, task } from './helpers';

async function setup() {
    const owner = await makeUser({ name: 'Olive Owner' });
    const project = await ProjectService.create({ name: 'Launch' }, owner);
    return { owner, project };
}

describe('creating tasks', () => {
    it('records creation in history and notifies the assignee without enrolling them in the project', async () => {
        const { owner, project } = await setup();
        const assignee = await makeUser({ name: 'Ann Assignee' });

        const created = await TaskService.create({ projectId: project.id, title: 'Write brief', assigneeId: assignee.id }, owner);

        expect(created.status).toBe('pending');
        expect((await history(created.id)).map((h) => h.type)).toEqual(['created']);
        expect(await notificationsFor(assignee.id, 'task_assigned')).toHaveLength(1);
        // Membership is explicit: assigning work does not add anyone to the team.
        expect(isProjectMember((await projectAccess(project.id))!, assignee.id)).toBe(false);
    });

    it('rejects a project that does not exist', async () => {
        const owner = await makeUser();
        await expect(TaskService.create({ projectId: 999, title: 'Lost' }, owner)).rejects.toMatchObject({ errors: { project_id: 'The selected project is invalid.' } });
    });
});

describe('standalone tasks', () => {
    it('creates a task with no project, records history and notifies the assignee', async () => {
        const me = await makeUser();
        const helper = await makeUser({ name: 'Hal Helper' });

        const created = await TaskService.create({ title: 'Renew parking permit', assigneeId: helper.id, dueDate: addDays(today(), 1) }, me);

        expect(created.projectId).toBeNull();
        expect((await history(created.id)).map((h) => h.type)).toEqual(['created']);
        const [assigned] = await notificationsFor(helper.id, 'task_assigned');
        expect(assigned.message).toContain('Standalone task');
    });

    it('updates and deletes without touching any project', async () => {
        const me = await makeUser();
        const t = await TaskService.create({ title: 'Quick fix', dueDate: addDays(today(), 7) }, me);

        await TaskService.applyUpdate(t.id, me, null, 50);
        await TaskService.updateDetails(t.id, { title: 'Quick fix (v2)' }, me);
        expect(await task(t.id)).toMatchObject({ status: 'in_progress', progress: 50, title: 'Quick fix (v2)' });

        await TaskService.delete(t.id, me);
        expect((await task(t.id)).deletedAt).not.toBeNull();
    });

    it('is auto-delayed when overdue, like any task', async () => {
        const me = await makeUser();
        const t = await TaskService.create({ title: 'Send invoice', assigneeId: me.id, dueDate: addDays(today(), 3) }, me);
        await db().update(schema.tasks).set({ dueDate: addDays(today(), -1) }).where(eq(schema.tasks.id, t.id));

        expect(await DeadlineService.markOverdueTasksDelayed()).toBe(1);
        expect((await task(t.id)).status).toBe('delayed');
    });
});

describe('collaborators', () => {
    it('never adds administrators or executives as collaborators', async () => {
        const { owner, project } = await setup();
        const admin = await makeUser({ admin: true });
        const executive = await makeUser({ executive: true });
        const colleague = await makeUser();

        const t = await TaskService.create({ projectId: project.id, title: 'Vendor review', collaboratorIds: [admin.id, colleague.id] }, owner);
        expect(await TaskService.addCollaborator(t.id, executive.id, owner)).toBe(false);

        const rows = await db().select({ userId: schema.taskCollaborators.userId }).from(schema.taskCollaborators).where(eq(schema.taskCollaborators.taskId, t.id));
        expect(rows.map((r) => r.userId)).toEqual([colleague.id]);
    });
});

describe('update notifications', () => {
    it('notifies everyone involved about every update, including the person who made it', async () => {
        const { owner, project } = await setup();
        const helper = await makeUser({ name: 'Hana Helper' });
        const t = await TaskService.create({ projectId: project.id, title: 'Launch email', assigneeId: owner.id, collaboratorIds: [helper.id] }, owner);

        await TaskService.applyUpdate(t.id, owner, null, 25, 'Draft is ready');
        for (const id of [owner.id, helper.id]) {
            const [n] = await notificationsFor(id, 'task_updated');
            expect(n.title).toContain('25%');
            expect(n.message).toContain('Draft is ready');
        }

        await TaskService.updateDetails(t.id, { priority: 'high' }, helper);
        expect(await notificationsFor(owner.id, 'task_updated')).toHaveLength(2);

        await TaskService.applyUpdate(t.id, helper, 'completed', null);
        expect(await notificationsFor(owner.id, 'task_completed')).toHaveLength(1);
        expect(await notificationsFor(helper.id, 'task_completed')).toHaveLength(1);
    });

    it('sends a mention instead of a second update notification', async () => {
        const { owner, project } = await setup();
        const helper = await makeUser({ username: 'hana' });
        const t = await TaskService.create({ projectId: project.id, title: 'Budget', collaboratorIds: [helper.id] }, owner);

        await TaskService.applyUpdate(t.id, owner, null, null, '@hana can you check the numbers?');
        expect(await notificationsFor(helper.id, 'mentioned')).toHaveLength(1);
        expect(await notificationsFor(helper.id, 'task_updated')).toHaveLength(0);
        expect(await notificationsFor(owner.id, 'task_updated')).toHaveLength(1);
    });
});

describe('status and progress stay in sync', () => {
    it('derives status from progress and progress from status', async () => {
        const { owner, project } = await setup();
        const t = await TaskService.create({ projectId: project.id, title: 'Sync' }, owner);

        await TaskService.applyUpdate(t.id, owner, null, 40);
        expect(await task(t.id)).toMatchObject({ status: 'in_progress', progress: 40 });

        await TaskService.applyUpdate(t.id, owner, 'completed', null);
        expect(await task(t.id)).toMatchObject({ status: 'completed', progress: 100 });
        expect((await task(t.id)).completedAt).not.toBeNull();

        await TaskService.applyUpdate(t.id, owner, 'pending', null);
        expect(await task(t.id)).toMatchObject({ status: 'pending', progress: 0, completedAt: null });
    });

    it('treats an unchanged status with a new progress as "progress drives"', async () => {
        const { owner, project } = await setup();
        const t = await TaskService.create({ projectId: project.id, title: 'Form', progress: 30 }, owner);
        expect((await task(t.id)).status).toBe('in_progress');

        // The quick-update form always submits both fields.
        await TaskService.applyUpdate(t.id, owner, 'in_progress', 100);
        expect(await task(t.id)).toMatchObject({ status: 'completed', progress: 100 });
    });

    it('records a remark-only update and returns null when nothing changed', async () => {
        const { owner, project } = await setup();
        const t = await TaskService.create({ projectId: project.id, title: 'Remarks' }, owner);

        expect(await TaskService.applyUpdate(t.id, owner, null, null, '   ')).toBeNull();
        const update = await TaskService.applyUpdate(t.id, owner, null, null, 'Waiting on legal.');
        expect(update?.type).toBe('remark');
        expect((await task(t.id)).latestRemark).toBe('Waiting on legal.');
    });

    it('keeps history append-only', async () => {
        const { owner, project } = await setup();
        const t = await TaskService.create({ projectId: project.id, title: 'History' }, owner);
        await expect(db().execute(sql`update task_updates set remark = 'tampered' where task_id = ${t.id}`)).rejects.toThrow();
        await expect(db().execute(sql`delete from task_updates where task_id = ${t.id}`)).rejects.toThrow();
    });
});

describe('automatic delay', () => {
    it('marks an overdue task delayed, keeps it delayed when In Progress is picked, and clears it when rescheduled', async () => {
        const { owner, project } = await setup();
        const assignee = await makeUser();
        const t = await TaskService.create({ projectId: project.id, title: 'Late', assigneeId: assignee.id, dueDate: addDays(today(), -2) }, owner);

        expect((await task(t.id)).status).toBe('delayed');
        expect(await notificationsFor(assignee.id, 'task_delayed')).toHaveLength(1);

        const update = await TaskService.applyUpdate(t.id, owner, 'in_progress', 50);
        expect(await task(t.id)).toMatchObject({ status: 'delayed', progress: 50 });
        expect(update?.meta).toEqual({ requested_status: 'in_progress' });

        await TaskService.updateDetails(t.id, { dueDate: addDays(today(), 5) }, owner);
        expect(await task(t.id)).toMatchObject({ status: 'in_progress', progress: 50, delayedAt: null });
        expect((await history(t.id)).map((h) => h.type)).toContain('undelayed');
    });

    it('does nothing when auto-delay is switched off', async () => {
        await Settings.set({ 'deadline.auto_delay_enabled': false });
        const { owner, project } = await setup();
        const t = await TaskService.create({ projectId: project.id, title: 'Late', dueDate: addDays(today(), -2) }, owner);
        expect((await task(t.id)).status).toBe('pending');
    });

    it('is applied by the scheduled check', async () => {
        const { owner, project } = await setup();
        const t = await TaskService.create({ projectId: project.id, title: 'Slips', dueDate: addDays(today(), 1) }, owner);
        await db().update(schema.tasks).set({ dueDate: addDays(today(), -1) }).where(eq(schema.tasks.id, t.id));

        const result = await DeadlineService.run();
        expect(result.delayed).toBe(1);
        expect((await task(t.id)).status).toBe('delayed');
    });
});

describe('project roll-up', () => {
    it('rolls project progress up from its tasks, ignoring cancelled ones', async () => {
        const { owner, project } = await setup();
        const a = await TaskService.create({ projectId: project.id, title: 'A' }, owner);
        const b = await TaskService.create({ projectId: project.id, title: 'B' }, owner);
        await TaskService.applyUpdate(a.id, owner, null, 80);
        await TaskService.applyUpdate(b.id, owner, 'cancelled', null);

        const [p] = await db().select().from(schema.projects).where(eq(schema.projects.id, project.id));
        expect(p.progress).toBe(80);
    });
});

describe('collaborators and assignment', () => {
    it('never makes the assignee a collaborator', async () => {
        const { owner, project } = await setup();
        const person = await makeUser();
        const t = await TaskService.create({ projectId: project.id, title: 'Pair', collaboratorIds: [person.id] }, owner);
        expect(await notificationsFor(person.id, 'collaborator_added')).toHaveLength(1);

        await TaskService.updateDetails(t.id, { assigneeId: person.id }, owner);
        const collaborators = await db().select().from(schema.taskCollaborators).where(eq(schema.taskCollaborators.taskId, t.id));
        expect(collaborators).toHaveLength(0);
        expect(await TaskService.addCollaborator(t.id, person.id, owner)).toBe(false);
        expect((await history(t.id)).map((h) => h.type)).toContain('assignment');
    });
});

describe('deadline reminders', () => {
    it('reminds the assignee once per due date', async () => {
        const { owner, project } = await setup();
        const assignee = await makeUser();
        await TaskService.create({ projectId: project.id, title: 'Soon', assigneeId: assignee.id, dueDate: addDays(today(), 1) }, owner);

        expect(await DeadlineService.sendDeadlineReminders()).toBe(1);
        expect(await DeadlineService.sendDeadlineReminders()).toBe(0);
        const [reminder] = await notificationsFor(assignee.id, 'deadline_approaching');
        expect(reminder.title).toContain('due tomorrow');
    });
});

describe('mentions', () => {
    it('notifies mentioned people who can open the task, and nobody else', async () => {
        const { owner, project } = await setup();
        const member = await makeUser({ username: 'maria' });
        const outsider = await makeUser({ username: 'otto' });
        await ProjectService.addMember(project.id, member.id, owner);
        const t = await TaskService.create({ projectId: project.id, title: 'Mention me' }, owner);

        await TaskService.applyUpdate(t.id, owner, null, null, 'Thoughts @Maria and @otto? email@domain.com');

        expect(await notificationsFor(member.id, 'mentioned')).toHaveLength(1);
        expect(await notificationsFor(outsider.id, 'mentioned')).toHaveLength(0);
    });
});

describe('deleting', () => {
    it('soft-deletes a task, keeps its history and refreshes the project', async () => {
        const { owner, project } = await setup();
        const done = await TaskService.create({ projectId: project.id, title: 'Done', progress: 100 }, owner);
        const open = await TaskService.create({ projectId: project.id, title: 'Open' }, owner);
        expect((await db().select().from(schema.projects).where(eq(schema.projects.id, project.id)))[0].progress).toBe(50);

        await TaskService.delete(open.id, owner);
        expect((await task(open.id)).deletedAt).not.toBeNull();
        // History survives deletion.
        expect((await history(open.id)).length).toBeGreaterThan(0);
        expect((await db().select().from(schema.projects).where(eq(schema.projects.id, project.id)))[0].progress).toBe(100);
        expect((await task(done.id)).deletedAt).toBeNull();
    });
});
