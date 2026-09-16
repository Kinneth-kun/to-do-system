<x-layouts.app title="Notifications">
    <div class="space-y-6">
        <x-page-header title="Notifications" description="Updates about your tasks and projects." class="mb-0">
            @if (auth()->user()->unreadNotifications()->exists())
                <x-slot:actions>
                    <form method="POST" action="{{ route('notifications.read-all') }}">
                        @csrf
                        <button class="btn-secondary" type="submit"><x-icon name="check" class="h-4 w-4" /> Mark all read</button>
                    </form>
                </x-slot:actions>
            @endif
        </x-page-header>

        <div class="card divide-y divide-slate-100">
            @forelse ($notifications as $notification)
                <div class="flex gap-3 p-4 {{ $notification->isRead() ? 'bg-white' : 'bg-indigo-50/40' }}">
                    <span class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-{{ $notification->type->color() }}-100 text-{{ $notification->type->color() }}-700">
                        <x-icon :name="$notification->type->icon()" class="h-4 w-4" />
                    </span>
                    <div class="min-w-0 flex-1">
                        <a href="{{ route('notifications.open', $notification) }}" class="block text-sm font-semibold text-slate-900 hover:text-indigo-700">{{ $notification->title }}</a>
                        @if ($notification->message)
                            <p class="mt-1 text-sm text-slate-600">{{ $notification->message }}</p>
                        @endif
                        <p class="mt-2 text-xs text-slate-400">{{ $notification->created_at?->diffForHumans() }}</p>
                    </div>
                    @if (! $notification->isRead())
                        <form method="POST" action="{{ route('notifications.read', $notification) }}">
                            @csrf
                            <button class="btn-ghost btn-sm whitespace-nowrap text-xs" type="submit">Mark read</button>
                        </form>
                    @endif
                </div>
            @empty
                <x-empty-state icon="bell" title="You're all caught up" description="New task and collaboration updates will appear here." />
            @endforelse
        </div>

        @if ($notifications->hasPages())
            <div>{{ $notifications->links() }}</div>
        @endif
    </div>
</x-layouts.app>
