import { describe, expect, it } from 'vitest';
import { addDays, today } from '@/lib/dates';
import { sendDailyDigest } from '@/lib/services/digest';
import { ProjectService } from '@/lib/services/projects';
import { TaskService } from '@/lib/services/tasks';
import { Settings } from '@/lib/settings';
import { makeUser, notificationsFor } from './helpers';

describe('daily digest', () => {
    it('briefs people with open work once a day, with a plain summary when there is no API key', async () => {
        delete process.env.ANTHROPIC_API_KEY;
        const owner = await makeUser({ name: 'Olive Owner' });
        const busy = await makeUser({ name: 'Bea Busy' });
        await makeUser({ name: 'Ian Idle' });
        const p = await ProjectService.create({ name: 'Ops' }, owner);
        await TaskService.create({ projectId: p.id, title: 'Renew permits', assigneeId: busy.id, dueDate: addDays(today(), -1) }, owner);
        await TaskService.create({ projectId: p.id, title: 'Order supplies', assigneeId: busy.id, dueDate: today() }, owner);

        const first = await sendDailyDigest();
        const [digest] = await notificationsFor(busy.id, 'daily_digest');
        expect(digest.title).toBe('1 overdue, 1 due today');
        expect(digest.message).toContain('"Renew permits"');
        expect(digest.data).toMatchObject({ overdue: 1, due_today: 1, ai: false });
        // The owner created both tasks, so they are briefed too; Ian has nothing open.
        expect(first.sent).toBe(2);
        expect(first.lines.some((l) => l.includes('Ian Idle — nothing open'))).toBe(true);

        const second = await sendDailyDigest();
        expect(second.sent).toBe(0);
        expect(await notificationsFor(busy.id, 'daily_digest')).toHaveLength(1);

        await sendDailyDigest({ force: true, user: busy.username });
        expect(await notificationsFor(busy.id, 'daily_digest')).toHaveLength(2);
    });

    it('writes nothing on a dry run and respects the master switch', async () => {
        const owner = await makeUser();
        const p = await ProjectService.create({ name: 'Ops' }, owner);
        await TaskService.create({ projectId: p.id, title: 'Something', assigneeId: owner.id }, owner);

        const dry = await sendDailyDigest({ dryRun: true });
        expect(dry.sent).toBe(1);
        expect(await notificationsFor(owner.id, 'daily_digest')).toHaveLength(0);

        await Settings.set({ 'digest.enabled': false });
        expect((await sendDailyDigest()).disabled).toBe(true);
    });
});
