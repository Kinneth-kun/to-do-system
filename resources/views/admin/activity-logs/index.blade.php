<x-layouts.app title="Activity Logs">
    <x-page-header title="Activity Logs" description="A record of important changes across TaskFlow." />
    <form method="GET" class="card mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <div class="flex-1"><label class="form-label" for="action">Action starts with</label><input class="form-input" id="action" name="action" value="{{ request('action') }}" placeholder="task. or project."></div>
        <div class="flex-1"><label class="form-label" for="user_id">User</label><select class="form-select" id="user_id" name="user_id"><option value="">All users</option>@foreach($users as $user)<option value="{{ $user->id }}" @selected(request('user_id') == $user->id)>{{ $user->name }}</option>@endforeach</select></div>
        <button class="btn-secondary" type="submit">Filter</button>
    </form>
    <div class="card divide-y divide-slate-100">
        @forelse($logs as $log)
            <div class="flex gap-3 p-4"><x-avatar :user="$log->user" size="sm" /><div class="min-w-0 flex-1"><p class="text-sm text-slate-800">{{ $log->description }}</p><p class="mt-1 text-xs text-slate-500">{{ $log->action }} · {{ $log->created_at?->diffForHumans() }}{{ $log->user ? ' · '.$log->user->name : '' }}</p></div></div>
        @empty
            <x-empty-state icon="clipboard" title="No activity found" description="Try changing the filters." />
        @endforelse
    </div>
    <div class="mt-5">{{ $logs->links() }}</div>
</x-layouts.app>
