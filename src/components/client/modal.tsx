'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../icon';

/*
 * Dialogs, opened and closed by name from anywhere (Alpine's $dispatch('open-modal', 'name')):
 *
 *   openModal('quick-create')   closeModal('quick-create')
 *
 * Rendered into document.body so no ancestor with backdrop-filter/transform can trap the fixed
 * overlay (the bug the Laravel app hit with the blurred top bar). The panel stays mounted while
 * closed, so a half-filled form survives closing and reopening.
 */

export const openModal = (name: string) => window.dispatchEvent(new CustomEvent('open-modal', { detail: name }));
export const closeModal = (name: string) => window.dispatchEvent(new CustomEvent('close-modal', { detail: name }));

// Open dialogs, innermost last: Escape and Tab only act on the topmost one.
const stack: string[] = [];

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const WIDTHS = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-lg', xl: 'sm:max-w-xl', '2xl': 'sm:max-w-2xl' };

export function Modal({
    name,
    title,
    maxWidth = 'lg',
    initialOpen = false,
    onClose,
    children,
}: {
    name: string;
    title?: string;
    maxWidth?: keyof typeof WIDTHS;
    initialOpen?: boolean;
    onClose?: () => void;
    children: ReactNode;
}) {
    const [open, setOpen] = useState(initialOpen);
    const [mounted, setMounted] = useState(false);
    const panel = useRef<HTMLDivElement>(null);

    const close = useCallback(() => {
        setOpen(false);
        onClose?.();
    }, [onClose]);

    useEffect(() => setMounted(true), []);

    useEffect(() => {
        const onOpen = (e: Event) => (e as CustomEvent).detail === name && setOpen(true);
        const onCloseEvent = (e: Event) => (e as CustomEvent).detail === name && close();
        window.addEventListener('open-modal', onOpen);
        window.addEventListener('close-modal', onCloseEvent);
        return () => {
            window.removeEventListener('open-modal', onOpen);
            window.removeEventListener('close-modal', onCloseEvent);
        };
    }, [name, close]);

    useEffect(() => {
        if (!open) return;
        stack.push(name);
        document.body.style.overflow = 'hidden';
        const focusables = () => [...(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((el) => el.offsetParent !== null);
        // Start in the first field when there is one, rather than on the close button.
        requestAnimationFrame(() => (focusables().find((el) => el.matches('input, select, textarea')) ?? focusables()[0])?.focus());

        const onKey = (event: KeyboardEvent) => {
            if (stack.at(-1) !== name) return;
            if (event.key === 'Escape') close();
            if (event.key !== 'Tab') return;
            // Keep Tab inside the dialog while it is open.
            const items = focusables();
            if (!items.length) return;
            const first = items[0];
            const last = items[items.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('keydown', onKey);
            const index = stack.lastIndexOf(name);
            if (index !== -1) stack.splice(index, 1);
            if (!stack.length) document.body.style.overflow = '';
        };
    }, [open, close, name]);

    if (!mounted) return null;

    return createPortal(
        <div className={open ? 'fixed inset-0 z-50 overflow-y-auto' : 'hidden'} role="dialog" aria-modal="true" aria-label={title}>
            <div className="animate-fade-in fixed inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={close} />
            <div className="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
                <div ref={panel} className={`animate-pop-in relative w-full rounded-t-2xl bg-white shadow-xl sm:rounded-2xl ${WIDTHS[maxWidth]}`}>
                    {title && (
                        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
                            <button type="button" className="btn-icon -mr-2" onClick={close} aria-label="Close">
                                <Icon name="x" className="h-5 w-5" />
                            </button>
                        </div>
                    )}
                    {children}
                </div>
            </div>
        </div>,
        document.body,
    );
}
