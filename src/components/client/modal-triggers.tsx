'use client';

import type { ReactNode } from 'react';
import { openModal } from './modal';

export function OpenModalButton({ name, className, children, title }: { name: string; className?: string; children: ReactNode; title?: string }) {
    return (
        <button type="button" className={className} title={title} onClick={() => openModal(name)}>
            {children}
        </button>
    );
}

