@props(['title' => null, 'fullWidth' => false, 'bare' => false])
{{--
    Usage:
      <x-layouts.app title="Projects">…</x-layouts.app>
      <x-layouts.app title="Calendar" :full-width="true">…</x-layouts.app>   (no max-width container)
      <x-layouts.app title="Meeting" :bare="true">…</x-layouts.app>          (no sidebar/topbar — presentation mode)
--}}
@php
    $user = auth()->user();
    $appName = $appName ?? \App\Services\Settings::string('general.app_name');
    $unreadNotificationCount = $unreadNotificationCount ?? ($user ? $user->unreadNotifications()->count() : 0);

    $nav = [
        ['label' => 'Dashboard', 'route' => 'dashboard', 'icon' => 'home', 'active' => 'dashboard'],
        ['label' => 'My Tasks', 'route' => 'tasks.index', 'icon' => 'tasks', 'active' => 'tasks.*'],
        ['label' => 'Projects', 'route' => 'projects.index', 'icon' => 'folder', 'active' => 'projects.*'],
        ['label' => 'Calendar', 'route' => 'calendar', 'icon' => 'calendar', 'active' => 'calendar'],
        ['label' => 'Notifications', 'route' => 'notifications.index', 'icon' => 'bell', 'active' => 'notifications.*', 'badge' => $unreadNotificationCount],
    ];
    $management = [
        ['label' => 'Executive Dashboard', 'route' => 'admin.executive', 'icon' => 'chart', 'active' => 'admin.executive'],
        ['label' => 'Meeting Mode', 'route' => 'admin.meeting', 'icon' => 'presentation', 'active' => 'admin.meeting'],
    ];
    $admin = [
        ['label' => 'Users', 'route' => 'admin.users.index', 'icon' => 'users', 'active' => 'admin.users.*'],
        ['label' => 'Activity Logs', 'route' => 'admin.activity-logs.index', 'icon' => 'clipboard', 'active' => 'admin.activity-logs.*'],
        ['label' => 'Settings', 'route' => 'admin.settings.edit', 'icon' => 'cog', 'active' => 'admin.settings.*'],
    ];

    $toasts = collect([
        session('success') ? ['message' => session('success'), 'type' => 'success'] : null,
        session('status') ? ['message' => session('status'), 'type' => 'success'] : null,
        session('error') ? ['message' => session('error'), 'type' => 'error'] : null,
        session('warning') ? ['message' => session('warning'), 'type' => 'warning'] : null,
    ])->filter()->values();
@endphp
<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" class="h-full">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>{{ $title ? $title.' · ' : '' }}{{ $appName }}</title>
    <link rel="preconnect" href="https://fonts.bunny.net">
    <link href="https://fonts.bunny.net/css?family=inter:400,500,600,700&display=swap" rel="stylesheet" />
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%234f46e5'/><path d='M9 16.5l4.5 4.5L23 11' stroke='white' stroke-width='3' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>">
    @vite(['resources/css/app.css', 'resources/js/app.js'])
    {{ $head ?? '' }}
</head>
<body class="h-full" x-data="{ sidebarOpen: false }" x-on:keydown.window.slash="if (!['INPUT','TEXTAREA','SELECT'].includes($event.target.tagName)) { $event.preventDefault(); $dispatch('focus-search') }">

@if ($bare)
    <main class="min-h-full">{{ $slot }}</main>
@else
    {{-- Mobile sidebar backdrop --}}
    <div x-show="sidebarOpen" x-cloak x-transition.opacity class="fixed inset-0 z-40 bg-slate-900/60 lg:hidden" x-on:click="sidebarOpen = false"></div>

    {{-- Sidebar --}}
    <aside
        class="fixed inset-y-0 left-0 z-50 flex w-64 -translate-x-full flex-col bg-slate-900 transition-transform duration-200 lg:translate-x-0"
        x-bind:class="sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'"
        aria-label="Main navigation"
    >
        <div class="flex h-16 shrink-0 items-center justify-between gap-2 px-5">
            <a href="{{ route('dashboard') }}" class="flex items-center gap-2.5">
                <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 text-white shadow-lg shadow-indigo-500/30">
                    <x-icon name="check" class="h-5 w-5" stroke="2.5" />
                </span>
                <span class="text-lg font-bold tracking-tight text-white">{{ $appName }}</span>
            </a>
            <button type="button" class="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white lg:hidden" x-on:click="sidebarOpen = false" aria-label="Close menu">
                <x-icon name="x" class="h-5 w-5" />
            </button>
        </div>

        <nav class="flex-1 space-y-6 overflow-y-auto px-3 py-4">
            <div class="space-y-1">
                @foreach ($nav as $item)
                    <a href="{{ route($item['route']) }}" @class(['nav-link', 'nav-link-active' => request()->routeIs($item['active'])])>
                        <x-icon :name="$item['icon']" class="h-5 w-5 shrink-0" />
                        <span class="flex-1">{{ $item['label'] }}</span>
                        @if (! empty($item['badge']))
                            <span class="rounded-full bg-indigo-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">{{ $item['badge'] > 99 ? '99+' : $item['badge'] }}</span>
                        @endif
                    </a>
                @endforeach
            </div>

            @if ($user?->isAdmin())
                <div>
                    <p class="px-3 pb-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Management</p>
                    <div class="space-y-1">
                        @foreach ($management as $item)
                            <a href="{{ route($item['route']) }}" @class(['nav-link', 'nav-link-active' => request()->routeIs($item['active'])])>
                                <x-icon :name="$item['icon']" class="h-5 w-5 shrink-0" />
                                <span>{{ $item['label'] }}</span>
                            </a>
                        @endforeach
                    </div>
                </div>
                <div>
                    <p class="px-3 pb-2 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">Administration</p>
                    <div class="space-y-1">
                        @foreach ($admin as $item)
                            <a href="{{ route($item['route']) }}" @class(['nav-link', 'nav-link-active' => request()->routeIs($item['active'])])>
                                <x-icon :name="$item['icon']" class="h-5 w-5 shrink-0" />
                                <span>{{ $item['label'] }}</span>
                            </a>
                        @endforeach
                    </div>
                </div>
            @endif
        </nav>

        @if ($user)
            <div class="border-t border-white/10 p-3">
                <a href="{{ route('profile.edit') }}" class="flex items-center gap-3 rounded-lg p-2 hover:bg-white/5">
                    <x-avatar :user="$user" size="md" class="ring-slate-900" />
                    <div class="min-w-0 flex-1">
                        <div class="truncate text-sm font-medium text-white">{{ $user->name }}</div>
                        <div class="truncate text-xs text-slate-400">{{ $user->isAdmin() ? 'Administrator' : ($user->job_title ?: 'Member') }}</div>
                    </div>
                </a>
            </div>
        @endif
    </aside>

    <div class="flex min-h-full flex-col lg:pl-64">
        {{-- Top bar --}}
        <header class="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur">
            <div class="flex h-16 items-center gap-2 px-3 sm:gap-3 sm:px-6 lg:px-8">
                <button type="button" class="btn-icon lg:hidden" x-on:click="sidebarOpen = true" aria-label="Open menu">
                    <x-icon name="menu" class="h-6 w-6" />
                </button>

                <div class="min-w-0 flex-1">
                    @include('partials.search-bar')
                </div>

                <div class="flex items-center gap-1 sm:gap-2">
                    @include('partials.quick-create')
                    @include('partials.notification-bell')

                    <x-dropdown width="w-56">
                        <x-slot:trigger>
                            <button type="button" class="flex items-center gap-2 rounded-full p-0.5 hover:ring-2 hover:ring-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500" aria-label="Account menu">
                                <x-avatar :user="$user" size="md" :title="false" />
                            </button>
                        </x-slot:trigger>
                        <div class="border-b border-slate-100 px-3 py-2">
                            <div class="truncate text-sm font-semibold text-slate-900">{{ $user->name }}</div>
                            <div class="truncate text-xs text-slate-500">{{ '@'.$user->username }}</div>
                        </div>
                        <x-dropdown-link :href="route('profile.edit')" icon="user">My profile</x-dropdown-link>
                        <form method="POST" action="{{ route('logout') }}">
                            @csrf
                            <button type="submit" class="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">
                                <x-icon name="logout" class="h-4 w-4 opacity-70" /> Sign out
                            </button>
                        </form>
                    </x-dropdown>
                </div>
            </div>
        </header>

        <main @class(['flex-1 py-6 sm:py-8', 'mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8' => ! $fullWidth, 'px-3 sm:px-6 lg:px-8' => $fullWidth])>
            {{ $slot }}
        </main>
    </div>
@endif

    {{-- Toasts --}}
    <div x-data="toasts(@js($toasts))" class="pointer-events-none fixed inset-x-0 bottom-4 z-[60] flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-4 sm:items-end">
        <template x-for="t in items" :key="t.id">
            <div x-transition class="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-white p-3 shadow-lg"
                 :class="{ 'border-emerald-200': t.type === 'success', 'border-red-200': t.type === 'error', 'border-amber-200': t.type === 'warning' }">
                <span class="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
                      :class="{ 'bg-emerald-500': t.type === 'success', 'bg-red-500': t.type === 'error', 'bg-amber-500': t.type === 'warning' }"></span>
                <p class="flex-1 text-sm text-slate-700" x-text="t.message"></p>
                <button type="button" class="text-slate-400 hover:text-slate-600" x-on:click="remove(t.id)" aria-label="Dismiss">
                    <x-icon name="x" class="h-4 w-4" />
                </button>
            </div>
        </template>
    </div>
</body>
</html>
