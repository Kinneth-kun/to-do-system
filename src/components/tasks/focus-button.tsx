'use client';

import { useFormStatus } from 'react-dom';
import { toggleFocusAction } from '@/app/actions/tasks';
import { Icon } from '../icon';
import { cx } from '../ui';

function Star({ focused, labelled }: { focused: boolean; labelled: boolean }) {
    const { pending } = useFormStatus();
    const label = focused ? 'Remove from Focus of the Day' : 'Add to Focus of the Day';
    return (
        <button
            type="submit"
            disabled={pending}
            title={label}
            aria-label={label}
            aria-pressed={focused}
            className={cx(labelled ? 'btn-secondary' : 'btn-ghost btn-sm shrink-0 px-2', focused && 'text-amber-600', pending && 'opacity-60')}
        >
            <Icon name="star" className={cx('h-4 w-4', focused ? 'fill-amber-400 text-amber-500' : 'text-slate-400')} />
            {labelled && (focused ? 'In focus' : 'Add to focus')}
        </button>
    );
}

/** Pin or unpin a task as one of your priorities. `labelled` shows text next to the star. */
export function FocusButton({ taskId, focused, labelled = false }: { taskId: number; focused: boolean; labelled?: boolean }) {
    return (
        <form action={toggleFocusAction.bind(null, taskId)} className="shrink-0">
            <Star focused={focused} labelled={labelled} />
        </form>
    );
}
