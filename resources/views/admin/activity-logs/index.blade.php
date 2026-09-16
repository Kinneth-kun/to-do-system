@php
    $categoryColor = fn (string $category) => match ($category) {
        'auth' => 'slate',
        'project' => 'indigo',
        'task' => 'blue',
        'collaborator', 'comment' => 'violet',
        'attachment' => 'teal',
        'user' => 'amber',
        'settings' => 'rose',
        default => 'slate',
    };
@endphp
<x-layouts.app title="Activity Logs">
    <x-page-header title="Activity Logs" description="A record of important changes across TaskFlow." />

    <form method="GET" class="toolbar mb-6">
        <div class="relative min-w-0 flex-1 sm:max-w-xs">
            <x-icon name="filter" class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input class="form-input pl-9" id="action" name="action" value="{{ request('action') }}" placeholder="Action starts with, e.g. task." aria-label="Filter by action">
        </div>
        <select class="form-select sm:w-52" id="user_id" name="user_id" aria-label="Filter by user">
            <option value="">All users</option>
            @foreach ($users as $user)
                <option value="{{ $user->id }}" @selected(request('user_id') == $user->id)>{{ $user->name }}</option>
            @endforeach
        </select>
        <button class="btn-secondary" type="submit">Filter</button>
        @if (request('action') || request('user_id'))
            <a href="{{ route('admin.activity-logs.index') }}" class="btn-ghost btn-sm">Clear</a>
        @endif
    </form>

    <div class="card divide-y divide-slate-100">
        @forelse ($logs as $log)
            @php $category = $log->category(); $color = $categoryColor($category); @endphp
            <div class="flex items-start gap-3 px-5 py-3.5">
                @if ($log->user)
                    <x-avatar :user="$log->user" size="sm" />
                @else
                    <span class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500" title="System">
                        <x-icon name="refresh" class="h-3.5 w-3.5" />
                    </span>
                @endif

                <div class="min-w-0 flex-1">
                    <p class="text-sm text-slate-800">{{ $log->description }}</p>
                    <div class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                        <span class="chip bg-{{ $color }}-50 text-{{ $color }}-700">{{ $log->action }}</span>
                        <span>{{ $log->user?->name ?? 'System' }}</span>
                        <span aria-hidden="true">·</span>
                        <time title="{{ $log->created_at?->format('M j, Y g:i A') }}">{{ $log->created_at?->diffForHumans() }}</time>
                        @if ($log->ip_address)
                            <span aria-hidden="true">·</span>
                            <span class="font-mono text-[11px] text-slate-400">{{ $log->ip_address }}</span>
                        @endif
                    </div>
                </div>
            </div>
        @empty
            <x-empty-state icon="clipboard" title="No activity found" description="Try changing the filters or clearing them." />
        @endforelse
    </div>

    @if ($logs->hasPages())
        <div class="mt-6">{{ $logs->links() }}</div>
    @endif
</x-layouts.app>
