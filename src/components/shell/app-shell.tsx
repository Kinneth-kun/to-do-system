'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { logoutAction } from '@/app/actions/auth';
import { Icon } from '../icon';
import { Avatar, cx } from '../ui';
import { Dropdown } from '../client/dropdown';
import { openModal } from '../client/modal';
import { NotificationBell } from './notification-bell';
import { SearchBar } from './search-bar';

type ShellUser = { name: string; username: string; jobTitle: string | null; avatarColor: string; isAdmin: boolean; fullAccess: boolean; role: string };
type NavItem = { label: string; href: string; icon: string; match: (path: string) => boolean; badge?: number };

export function AppShell({ appName, user, unread, children }: { appName: string; user: ShellUser; unread: number; children: ReactNode }) {
    const pathname = usePathname();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => setSidebarOpen(false), [pathname]);

    // Keyboard shortcuts: "/" focuses search, "n" opens quick create (outside of form fields).
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement;
            if (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable || event.metaKey || event.ctrlKey || event.altKey) return;
            if (event.key === '/') {
                event.preventDefault();
                window.dispatchEvent(new CustomEvent('focus-search'));
            } else if (event.key === 'n') {
                event.preventDefault();
                openModal('quick-create');
            }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    const nav: NavItem[] = [
        { label: 'Dashboard', href: '/', icon: 'home', match: (p) => p === '/' },
        // Administrators and executives see every task, so the list is "All Tasks" for them.
        { label: user.fullAccess ? 'All Tasks' : 'My Tasks', href: '/tasks', icon: 'tasks', match: (p) => p.startsWith('/tasks') },
        { label: 'Projects', href: '/projects', icon: 'folder', match: (p) => p.startsWith('/projects') },
        { label: 'Calendar', href: '/calendar', icon: 'calendar', match: (p) => p.startsWith('/calendar') },
        { label: 'Notifications', href: '/notifications', icon: 'bell', match: (p) => p.startsWith('/notifications'), badge: unread },
    ];
    const management: NavItem[] = [
        { label: 'Executive Dashboard', href: '/admin/executive', icon: 'chart', match: (p) => p.startsWith('/admin/executive') },
        ...(user.isAdmin ? [{ label: 'Meeting Mode', href: '/admin/meeting', icon: 'presentation', match: (p: string) => p.startsWith('/admin/meeting') }] : []),
    ];
    // Executives get the dashboard and Activity Logs; Meeting Mode, Users and Settings are for administrators only.
    const admin: NavItem[] = [
        ...(user.isAdmin ? [{ label: 'Users', href: '/admin/users', icon: 'users', match: (p: string) => p.startsWith('/admin/users') }] : []),
        { label: 'Activity Logs', href: '/admin/activity-logs', icon: 'clipboard', match: (p) => p.startsWith('/admin/activity-logs') },
        ...(user.isAdmin ? [{ label: 'Settings', href: '/admin/settings', icon: 'cog', match: (p: string) => p.startsWith('/admin/settings') }] : []),
    ];

    const renderLink = (item: NavItem) => (
        <Link key={item.href} href={item.href} className={cx('nav-link', item.match(pathname) && 'nav-link-active')}>
            <Icon name={item.icon} className="h-5 w-5 shrink-0" />
            <span className="flex-1">{item.label}</span>
            {!!item.badge && <span className="rounded-full bg-indigo-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">{item.badge > 99 ? '99+' : item.badge}</span>}
        </Link>
    );

    const fullWidth = pathname.startsWith('/calendar');

    return (
        <>
            {sidebarOpen && <div className="animate-fade-in fixed inset-0 z-40 bg-slate-900/60 lg:hidden" onClick={() => setSidebarOpen(false)} />}

            <aside
                className={cx('fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-slate-900 transition-transform duration-200 lg:translate-x-0', sidebarOpen ? 'translate-x-0' : '-translate-x-full')}
                aria-label="Main navigation"
            >
                <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-5">
                    <Link href="/" className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 text-white shadow-lg shadow-indigo-500/30">
                            <Icon name="check" className="h-5 w-5" stroke={2.5} />
                        </span>
                        <span className="text-lg font-bold tracking-tight text-white">{appName}</span>
                    </Link>
                    <button type="button" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden" onClick={() => setSidebarOpen(false)} aria-label="Close menu">
                        <Icon name="x" className="h-5 w-5" />
                    </button>
                </div>

                <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
                    <div className="space-y-1">{nav.map(renderLink)}</div>
                    {user.fullAccess && (
                        <>
                            <div>
                                <p className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Management</p>
                                <div className="space-y-1">{management.map(renderLink)}</div>
                            </div>
                            <div>
                                <p className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Administration</p>
                                <div className="space-y-1">{admin.map(renderLink)}</div>
                            </div>
                        </>
                    )}
                </nav>

                <div className="border-t border-white/10 p-3">
                    <Link href="/profile" className="flex items-center gap-3 rounded-lg p-2 hover:bg-white/5">
                        <Avatar user={user} size="md" className="ring-slate-900" />
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-white">{user.name}</div>
                            <div className="truncate text-xs text-slate-400">{user.role === 'admin' ? 'Administrator' : user.role === 'executive' ? 'Executive' : user.jobTitle || 'Member'}</div>
                        </div>
                    </Link>
                </div>
            </aside>

            <div className="flex min-h-full flex-col lg:pl-64">
                <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur">
                    <div className="flex h-16 items-center gap-2 px-3 sm:gap-3 sm:px-6 lg:px-8">
                        <button type="button" className="btn-icon lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
                            <Icon name="menu" className="h-6 w-6" />
                        </button>

                        <div className="min-w-0 flex-1">
                            <Suspense fallback={<div className="h-9 max-w-xl rounded-lg bg-slate-100/70" />}>
                                <SearchBar />
                            </Suspense>
                        </div>

                        <div className="flex items-center gap-1 sm:gap-2">
                            <button
                                type="button"
                                className="btn-icon text-slate-600 hover:bg-indigo-50 hover:text-indigo-600"
                                onClick={() => openModal('quick-create')}
                                title="Quick create (n)"
                                aria-label="Quick create"
                            >
                                <Icon name="plus" className="h-5 w-5" stroke={2} />
                            </button>
                            <NotificationBell initialUnread={unread} />
                            <Dropdown
                                width="w-56"
                                trigger={
                                    <button type="button" className="flex items-center gap-2 rounded-full p-0.5 hover:ring-2 hover:ring-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" aria-label="Account menu">
                                        <Avatar user={user} size="md" title={false} />
                                    </button>
                                }
                            >
                                <div className="border-b border-slate-100 px-3 py-2">
                                    <div className="truncate text-sm font-semibold text-slate-900">{user.name}</div>
                                    <div className="truncate text-xs text-slate-500">{user.username}</div>
                                </div>
                                <Link href="/profile" className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
                                    <Icon name="user" className="h-4 w-4 opacity-70" /> My profile
                                </Link>
                                <form action={logoutAction}>
                                    <button type="submit" className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">
                                        <Icon name="logout" className="h-4 w-4 opacity-70" /> Sign out
                                    </button>
                                </form>
                            </Dropdown>
                        </div>
                    </div>
                </header>

                <main className={cx('flex-1 py-6 sm:py-8', fullWidth ? 'px-3 sm:px-6 lg:px-8' : 'mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8')}>{children}</main>
            </div>
        </>
    );
}
