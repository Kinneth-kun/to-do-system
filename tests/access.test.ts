import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, schema } from '@/lib/db';
import { can, projectVisibleTo, taskAccess, taskVisibleTo } from '@/lib/access';
import { acquireLock, rateLimit } from '@/lib/locks';
import { ProjectService } from '@/lib/services/projects';
import { TaskService } from '@/lib/services/tasks';
import { safeRelativePath } from '@/lib/urls';
import { actor, makeUser } from './helpers';

async function visibleTaskTitles(user: Awaited<ReturnType<typeof makeUser>>) {
    const rows = await db().select({ title: schema.tasks.title }).from(schema.tasks).where(and(taskVisibleTo(actor(user))));
    return rows.map((r) => r.title).sort();
}

describe('visibility', () => {
    it("never shows other people's projects or tasks to a regular user", async () => {
        const owner = await makeUser();
        const outsider = await makeUser();
        const admin = await makeUser({ admin: true });
        const p = await ProjectService.create({ name: 'Confidential Acquisition' }, owner);
        await TaskService.create({ projectId: p.id, title: 'Draft the offer letter' }, owner);

        const projectsFor = async (u: Awaited<ReturnType<typeof makeUser>>) =>
            (await db().select({ name: schema.projects.name }).from(schema.projects).where(projectVisibleTo(actor(u)))).map((r) => r.name);

        expect(await projectsFor(outsider)).toEqual([]);
        expect(await visibleTaskTitles(outsider)).toEqual([]);
        expect(await projectsFor(admin)).toEqual(['Confidential Acquisition']);
        expect(await visibleTaskTitles(owner)).toEqual(['Draft the offer letter']);
    });

    it('lets an assignee outside the team see and update their own task, but not the rest of the project', async () => {
        const owner = await makeUser();
        const assignee = await makeUser();
        const p = await ProjectService.create({ name: 'Team only' }, owner);
        const mine = await TaskService.create({ projectId: p.id, title: 'Mine', assigneeId: assignee.id }, owner);
        await TaskService.create({ projectId: p.id, title: 'Not mine' }, owner);

        expect(await visibleTaskTitles(assignee)).toEqual(['Mine']);
        const access = (await taskAccess(mine.id))!;
        expect(can.viewTask(actor(assignee), access)).toBe(true);
        expect(can.updateTask(actor(assignee), access)).toBe(true);
        expect(can.editTask(actor(assignee), access)).toBe(true);
        expect(can.deleteTask(actor(assignee), access)).toBe(false);
        expect(can.viewProject(actor(assignee), access.project!)).toBe(false);
    });

    it('shows a standalone task only to its creator, assignee, collaborators and admins', async () => {
        const creator = await makeUser();
        const assignee = await makeUser();
        const helper = await makeUser();
        const outsider = await makeUser();
        const admin = await makeUser({ admin: true });
        const t = await TaskService.create({ title: 'Call the landlord', assigneeId: assignee.id, collaboratorIds: [helper.id] }, creator);

        for (const u of [creator, assignee, helper, admin]) expect(await visibleTaskTitles(u)).toEqual(['Call the landlord']);
        expect(await visibleTaskTitles(outsider)).toEqual([]);

        const access = (await taskAccess(t.id))!;
        expect(access.project).toBeNull();
        expect(can.viewTask(actor(outsider), access)).toBe(false);
        expect(can.editTask(actor(creator), access)).toBe(true);
        expect(can.deleteTask(actor(creator), access)).toBe(true);
        expect(can.updateTask(actor(helper), access)).toBe(true);
        expect(can.deleteTask(actor(assignee), access)).toBe(false);
    });

    it("hides other departments' tasks from regular users unless they collaborate", async () => {
        const itLead = await makeUser({ department: 'information_technology' });
        const itDev = await makeUser({ department: 'information_technology' });
        const leasing = await makeUser({ department: 'leasing' });
        const p = await ProjectService.create({ name: 'ICM Lease', memberIds: [itDev.id, leasing.id] }, itLead);
        await TaskService.create({ projectId: p.id, title: 'Coding', assigneeId: itLead.id }, itLead);
        const contract = await TaskService.create({ projectId: p.id, title: 'Lease contract template', assigneeId: leasing.id }, leasing);

        // Same department through the project; other department hidden.
        expect(await visibleTaskTitles(itDev)).toEqual(['Coding']);
        expect(await visibleTaskTitles(leasing)).toEqual(['Lease contract template']);
        // Even the project owner (a manager) can't open another department's task…
        expect(can.viewTask(actor(itLead), (await taskAccess(contract.id))!)).toBe(false);
        expect(can.editTask(actor(itLead), (await taskAccess(contract.id))!)).toBe(false);

        // …until they're invited as a collaborator.
        await TaskService.addCollaborator(contract.id, itDev.id, leasing);
        expect(await visibleTaskTitles(itDev)).toEqual(['Coding', 'Lease contract template']);
        expect(can.updateTask(actor(itDev), (await taskAccess(contract.id))!)).toBe(true);
    });

    it('gives executives the same view of every project and task as administrators', async () => {
        const owner = await makeUser();
        const executive = await makeUser({ executive: true });
        const p = await ProjectService.create({ name: 'Board pack' }, owner);
        const t = await TaskService.create({ projectId: p.id, title: 'Q3 numbers' }, owner);
        await TaskService.create({ title: 'Private errand' }, owner);

        const projects = await db().select({ name: schema.projects.name }).from(schema.projects).where(projectVisibleTo(actor(executive)));
        expect(projects.map((r) => r.name)).toEqual(['Board pack']);
        expect(await visibleTaskTitles(executive)).toEqual(['Private errand', 'Q3 numbers']);

        const access = (await taskAccess(t.id))!;
        expect(can.viewTask(actor(executive), access)).toBe(true);
        expect(can.editTask(actor(executive), access)).toBe(true);
        expect(can.updateProject(actor(executive), access.project!)).toBe(true);
    });

    it('gives managers edit rights and members view rights', async () => {
        const owner = await makeUser();
        const manager = await makeUser();
        const member = await makeUser();
        const p = await ProjectService.create({ name: 'Roles' }, owner);
        await ProjectService.addMember(p.id, manager.id, owner, 'manager');
        await ProjectService.addMember(p.id, member.id, owner, 'member');
        const t = await TaskService.create({ projectId: p.id, title: 'Shared' }, owner);
        const access = (await taskAccess(t.id))!;

        expect(can.updateProject(actor(manager), access.project!)).toBe(true);
        expect(can.updateProject(actor(member), access.project!)).toBe(false);
        expect(can.deleteProject(actor(manager), access.project!)).toBe(false);
        expect(can.deleteTask(actor(manager), access)).toBe(true);
        expect(can.viewTask(actor(member), access)).toBe(true);
        expect(can.updateTask(actor(member), access)).toBe(false);
        expect(can.comment(actor(member), access)).toBe(true);
    });

    it('hides deleted tasks', async () => {
        const owner = await makeUser();
        const p = await ProjectService.create({ name: 'Gone' }, owner);
        const t = await TaskService.create({ projectId: p.id, title: 'Soon gone' }, owner);
        await TaskService.delete(t.id, owner);
        expect(await taskAccess(t.id)).toBeNull();
        const [row] = await db().select().from(schema.tasks).where(eq(schema.tasks.id, t.id));
        expect(row.deletedAt).not.toBeNull();
    });
});

describe('redirect safety', () => {
    it('only accepts same-site relative paths', () => {
        expect(safeRelativePath('/tasks/1')).toBe('/tasks/1');
        expect(safeRelativePath('https://evil.example.com/phish')).toBeNull();
        expect(safeRelativePath('//evil.example.com')).toBeNull();
        expect(safeRelativePath('/\\evil.example.com')).toBeNull();
        expect(safeRelativePath(null)).toBeNull();
    });
});

describe('cross-instance coordination', () => {
    it('grants a lock once until it expires', async () => {
        expect(await acquireLock('job', 60)).toBe(true);
        expect(await acquireLock('job', 60)).toBe(false);
    });

    it('rate-limits within a window', async () => {
        for (let i = 0; i < 3; i++) expect((await rateLimit('login:1.2.3.4', 3, 60)).allowed).toBe(true);
        const blocked = await rateLimit('login:1.2.3.4', 3, 60);
        expect(blocked.allowed).toBe(false);
        expect(blocked.retryAfter).toBeGreaterThan(0);
    });
});
