import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm';
import { projectAlive, projectVisibleTo } from '@/lib/access';
import { requireUser } from '@/lib/auth/session';
import { db, schema } from '@/lib/db';
import { today } from '@/lib/dates';
import { readFlash } from '@/lib/flash';
import { Settings } from '@/lib/settings';
import { ConfirmDialog } from '@/components/client/confirm';
import { Toaster } from '@/components/client/toaster';
import { AppShell } from '@/components/shell/app-shell';
import { NewProjectModal } from '@/components/shell/new-project-modal';
import { QuickCreateModal } from '@/components/shell/quick-create';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
    const user = await requireUser();

    const appName = await Settings.string('general.app_name');
    const [{ unread }] = await db()
        .select({ unread: count() })
        .from(schema.notifications)
        .where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)));
    // Quick create offers projects that still take work.
    const quickProjects = await db()
        .select({ id: schema.projects.id, name: schema.projects.name })
        .from(schema.projects)
        .where(and(projectAlive, projectVisibleTo(user), inArray(schema.projects.status, ['active', 'on_hold'])))
        .orderBy(asc(schema.projects.name));
    const flashes = await readFlash();

    return (
        <>
            <AppShell appName={appName} user={user} unread={Number(unread)}>
                {children}
            </AppShell>
            <QuickCreateModal projects={quickProjects} today={today()} />
            <NewProjectModal />
            <ConfirmDialog />
            <Toaster flash={flashes} />
        </>
    );
}
