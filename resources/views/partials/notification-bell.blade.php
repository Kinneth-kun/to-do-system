{{-- Placeholder: the Notifications module replaces this with a dropdown of recent notifications. --}}
<a href="{{ route('notifications.index') }}" class="btn-icon relative" aria-label="Notifications">
    <x-icon name="bell" class="h-5 w-5" />
    @if (($unreadNotificationCount ?? 0) > 0)
        <span class="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white"></span>
    @endif
</a>
