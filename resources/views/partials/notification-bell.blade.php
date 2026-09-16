{{--
    Live notification bell: polls notifications.recent so new items (the 8am briefing, an
    assignment, a delay) appear without a page reload. Polling pauses while the tab is hidden
    and resumes on focus.
--}}
<div x-data="notificationBell({{ (int) ($unreadNotificationCount ?? 0) }})" class="relative" x-on:click.outside="open = false">
    <button type="button" class="btn-icon relative" x-on:click="toggle()"
            x-bind:aria-label="unread > 0 ? unread + ' unread notifications' : 'Notifications'" aria-haspopup="true">
        <x-icon name="bell" class="h-5 w-5" />
        <template x-if="unread > 0">
            <span class="absolute -top-1 -right-1 min-w-4 rounded-full bg-red-500 px-1 text-center text-[10px] leading-4 font-semibold text-white ring-2 ring-white"
                  x-text="unread > 99 ? '99+' : unread"></span>
        </template>
    </button>

    <div x-show="open" x-cloak x-transition.opacity.duration.100ms
         class="absolute right-0 z-40 mt-2 w-80 origin-top-right overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg sm:w-96">
        <div class="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
            <p class="text-sm font-semibold text-slate-900">Notifications</p>
            <button type="button" class="text-xs font-medium text-indigo-600 hover:underline"
                    x-show="unread > 0" x-on:click="markAllRead()">Mark all read</button>
        </div>

        <div class="max-h-96 overflow-y-auto">
            <template x-if="loading && items.length === 0">
                <p class="px-4 py-8 text-center text-sm text-slate-400">Loading…</p>
            </template>

            <template x-if="! loading && items.length === 0">
                <p class="px-4 py-8 text-center text-sm text-slate-500">You're all caught up.</p>
            </template>

            <template x-for="item in items" :key="item.id">
                <a x-bind:href="item.open_url"
                   class="flex gap-3 border-b border-slate-50 px-4 py-3 transition last:border-0 hover:bg-slate-50"
                   x-bind:class="item.read ? '' : 'bg-indigo-50/40'">
                    <span class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                          x-bind:class="`bg-${item.color}-100 text-${item.color}-700`">
                        <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
                            <circle cx="12" cy="12" r="9" />
                        </svg>
                    </span>
                    <span class="min-w-0 flex-1">
                        <span class="block text-sm font-medium text-slate-900" x-text="item.title"></span>
                        <span class="mt-0.5 block text-xs leading-relaxed text-slate-500" x-text="item.message"></span>
                        <span class="mt-1 block text-[11px] text-slate-400" x-text="item.time"></span>
                    </span>
                </a>
            </template>
        </div>

        <a href="{{ route('notifications.index') }}" class="block border-t border-slate-100 px-4 py-2.5 text-center text-sm font-medium text-indigo-600 hover:bg-slate-50">
            View all notifications
        </a>
    </div>
</div>
