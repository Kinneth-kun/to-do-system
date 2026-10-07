import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, schema } from '@/lib/db';
import { addDays, today } from '@/lib/dates';
import { ProjectHealthService } from '@/lib/services/health';
import { ProjectService } from '@/lib/services/projects';
import { TaskService } from '@/lib/services/tasks';
import { Settings } from '@/lib/settings';
import { makeUser, project as loadProject } from './helpers';

describe('project health', () => {
    it('is On Track with nothing delayed', async () => {
        const owner = await makeUser();
        const p = await ProjectService.create({ name: 'Calm' }, owner);
        await TaskService.create({ projectId: p.id, title: 'Fine', dueDate: addDays(today(), 20) }, owner);
        expect((await loadProject(p.id)).health).toBe('on_track');
    });

    it('is Delayed when the share of delayed open tasks crosses the threshold', async () => {
        const owner = await makeUser();
        const p = await ProjectService.create({ name: 'Slipping' }, owner);
        await TaskService.create({ projectId: p.id, title: 'Late', dueDate: addDays(today(), -1) }, owner);
        await TaskService.create({ projectId: p.id, title: 'Fine', dueDate: addDays(today(), 30) }, owner);

        const evaluation = await ProjectHealthService.evaluate((await loadProject(p.id))!);
        expect(evaluation.health).toBe('delayed');
        expect(evaluation.reasons[0]).toBe('1 of 2 open tasks are delayed (50%).');
    });

    it('is At Risk below the delayed threshold', async () => {
        await Settings.set({ 'health.delayed_delayed_percent': 60 });
        const owner = await makeUser();
        const p = await ProjectService.create({ name: 'Wobbly' }, owner);
        await TaskService.create({ projectId: p.id, title: 'Late', dueDate: addDays(today(), -1) }, owner);
        await TaskService.create({ projectId: p.id, title: 'Fine', dueDate: addDays(today(), 30) }, owner);
        expect((await loadProject(p.id)).health).toBe('at_risk');
    });

    it('is At Risk when progress falls behind the schedule', async () => {
        const owner = await makeUser();
        const p = await ProjectService.create({ name: 'Behind', startDate: addDays(today(), -50), dueDate: addDays(today(), 50) }, owner);
        await TaskService.create({ projectId: p.id, title: 'Barely started', progress: 10 }, owner);

        const evaluation = await ProjectHealthService.evaluate((await loadProject(p.id))!);
        expect(evaluation.health).toBe('at_risk');
        expect(evaluation.reasons).toContain('Progress is 10% but 50% of the schedule has elapsed.');
    });

    it('is Delayed when the project itself is overdue', async () => {
        const owner = await makeUser();
        const p = await ProjectService.create({ name: 'Overdue', dueDate: addDays(today(), -1) }, owner);
        await TaskService.create({ projectId: p.id, title: 'Open' }, owner);
        expect((await loadProject(p.id)).health).toBe('delayed');
    });

    it('follows the project status and completion', async () => {
        const owner = await makeUser();
        const p = await ProjectService.create({ name: 'Status' }, owner);
        const t = await TaskService.create({ projectId: p.id, title: 'Only' }, owner);

        await ProjectService.update(p.id, { status: 'on_hold' }, owner);
        expect((await loadProject(p.id)).health).toBe('on_hold');

        await ProjectService.update(p.id, { status: 'active' }, owner);
        await TaskService.applyUpdate(t.id, owner, 'completed', null);
        expect((await loadProject(p.id)).health).toBe('completed');
    });

    it('logs status changes and keeps the owner as a manager when ownership moves', async () => {
        const owner = await makeUser();
        const next = await makeUser();
        const p = await ProjectService.create({ name: 'Handover' }, owner);
        await ProjectService.update(p.id, { ownerId: next.id, status: 'completed' }, owner);

        const [membership] = await db()
            .select()
            .from(schema.projectMembers)
            .where(eq(schema.projectMembers.userId, next.id));
        expect(membership.role).toBe('manager');
        expect((await loadProject(p.id)).completedAt).not.toBeNull();
        expect(await ProjectService.removeMember(p.id, next.id, owner)).toBe(false);
    });
});
