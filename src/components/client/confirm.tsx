'use client';

import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Icon } from '../icon';
import { closeModal, Modal, openModal } from './modal';

/*
 * In-app confirmation, replacing the browser's confirm(). A <ConfirmForm> asks the single shared
 * <ConfirmDialog> (rendered once by the layout) before letting its submission through.
 */

type ConfirmOptions = { title?: string; message?: string; confirm?: string; danger?: boolean };
type Request = ConfirmOptions & { resolve: (ok: boolean) => void };

export function askConfirm(options: ConfirmOptions): Promise<boolean> {
    return new Promise((resolve) => window.dispatchEvent(new CustomEvent('confirm:request', { detail: { ...options, resolve } })));
}

export function ConfirmDialog() {
    const [request, setRequest] = useState<Request | null>(null);
    // The pending request lives in a ref too: closing the modal calls onClose synchronously,
    // and that must not settle the same request twice.
    const pending = useRef<Request | null>(null);

    useEffect(() => {
        const onRequest = (event: Event) => {
            pending.current?.resolve(false);
            pending.current = (event as CustomEvent<Request>).detail;
            setRequest(pending.current);
            openModal('confirm');
        };
        window.addEventListener('confirm:request', onRequest);
        return () => window.removeEventListener('confirm:request', onRequest);
    }, []);

    const settle = (ok: boolean) => {
        const current = pending.current;
        if (!current) return;
        pending.current = null;
        current.resolve(ok);
        closeModal('confirm');
    };

    const danger = request?.danger !== false;

    return (
        <Modal name="confirm" maxWidth="sm" onClose={() => settle(false)}>
            <div className="p-5">
                <div className="flex gap-4">
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${danger ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-600'}`}>
                        <Icon name="alert" className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                        <h2 className="text-base font-semibold tracking-tight text-slate-900">{request?.title ?? 'Are you sure?'}</h2>
                        <p className="mt-1 text-sm leading-relaxed text-slate-500">{request?.message ?? 'This action cannot be undone.'}</p>
                    </div>
                </div>
                <div className="mt-6 flex justify-end gap-2">
                    <button type="button" className="btn-secondary" onClick={() => settle(false)}>
                        Cancel
                    </button>
                    <button type="button" className={danger ? 'btn-danger' : 'btn-primary'} onClick={() => settle(true)}>
                        {request?.confirm ?? 'Confirm'}
                    </button>
                </div>
            </div>
        </Modal>
    );
}

/** A form that only submits after the user confirms in the shared dialog. */
export function ConfirmForm({ title, message, confirm, danger, onSubmit, ...props }: ComponentProps<'form'> & ConfirmOptions) {
    const confirmed = useRef(false);
    return (
        <form
            {...props}
            onSubmit={(event) => {
                if (confirmed.current) {
                    confirmed.current = false;
                    onSubmit?.(event);
                    return;
                }
                event.preventDefault();
                const form = event.currentTarget;
                askConfirm({ title, message, confirm, danger }).then((ok) => {
                    if (!ok) return;
                    confirmed.current = true;
                    form.requestSubmit();
                });
            }}
        />
    );
}
