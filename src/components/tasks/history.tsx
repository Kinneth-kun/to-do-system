import { diffForHumans, formatDate } from '@/lib/dates';
import { TaskUpdateType } from '@/lib/enums';
import type { UserLite } from '@/lib/users';
import { Icon } from '../icon';
import { Avatar, StatusBadge } from '../ui';

export type HistoryEntry = {
    id: number;
    type: string;
    oldStatus: string | null;
    newStatus: string | null;
    oldProgress: number | null;
    newProgress: number | null;
    remark: string | null;
    createdAt: Date;
    user: UserLite | null;
};

const statusChanged = (u: HistoryEntry) => u.newStatus !== null && u.oldStatus !== u.newStatus;
const progressChanged = (u: HistoryEntry) => u.newProgress !== null && u.oldProgress !== u.newProgress;

/** The append-only update timeline. `detailed` shows the type label and both kinds of change. */
export function History({ updates, detailed = false }: { updates: HistoryEntry[]; detailed?: boolean }) {
    return (
        <ol className={`relative border-l border-slate-200 pl-6 ${detailed ? 'space-y-6' : 'space-y-5'}`}>
            {updates.map((update) => (
                <li key={update.id} className="relative">
                    <span className="absolute -left-[1.9rem] flex h-6 w-6 items-center justify-center rounded-full bg-white ring-4 ring-white">
                        {update.user ? (
                            <Avatar user={update.user} size="xs" title={false} />
                        ) : (
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                                <Icon name="refresh" className="h-3 w-3" />
                            </span>
                        )}
                    </span>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-sm font-medium text-slate-800">{update.user?.name ?? 'System'}</span>
                        {detailed && <span className="text-xs text-slate-500">{TaskUpdateType.label(update.type as TaskUpdateType)}</span>}
                        <time className="text-xs text-slate-400" title={formatDate(update.createdAt, 'M j, Y g:i A')}>
                            {diffForHumans(update.createdAt)}
                        </time>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        {statusChanged(update) && (
                            <span className="inline-flex items-center gap-1.5">
                                <StatusBadge status={update.oldStatus} size="sm" />
                                <Icon name="arrow-right" className="h-3 w-3 text-slate-400" />
                                <StatusBadge status={update.newStatus} size="sm" />
                            </span>
                        )}
                        {progressChanged(update) && (detailed || !statusChanged(update)) && (
                            <span className="chip bg-slate-100 text-slate-600 tabular-nums">
                                {update.oldProgress}% → {update.newProgress}%
                            </span>
                        )}
                        {!detailed && !statusChanged(update) && !progressChanged(update) && <span className="text-xs text-slate-500">{TaskUpdateType.label(update.type as TaskUpdateType)}</span>}
                    </div>
                    {update.remark && <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-sm whitespace-pre-line text-slate-600">{update.remark}</p>}
                </li>
            ))}
        </ol>
    );
}
