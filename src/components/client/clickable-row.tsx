'use client';

import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

/** A table row that opens `href` when clicked anywhere (the link inside keeps it keyboard-accessible). */
export function ClickableRow({ href, children }: { href: string; children: ReactNode }) {
    const router = useRouter();
    return (
        <tr className="cursor-pointer" onClick={() => router.push(href)}>
            {children}
        </tr>
    );
}
