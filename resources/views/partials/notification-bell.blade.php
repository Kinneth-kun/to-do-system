<a href="{{ route('notifications.index') }}" class="btn-icon relative" aria-label="Notifications{{ ($unreadNotificationCount ?? 0) > 0 ? ', '.($unreadNotificationCount).' unread' : '' }}">
    <x-icon name="bell" class="h-5 w-5" />
    @if (($unreadNotificationCount ?? 0) > 0)
        <span class="absolute -top-1 -right-1 min-w-4 rounded-full bg-red-500 px-1 text-center text-[10px] leading-4 font-semibold text-white ring-2 ring-white">{{ $unreadNotificationCount > 99 ? '99+' : $unreadNotificationCount }}</span>
    @endif
</a>
