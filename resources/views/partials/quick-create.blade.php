@php
    // Global quick create. Minimal fields only — "More options" opens the full form.
    $quickProjects = once(fn () => \App\Models\Project::query()
        ->visibleTo(auth()->user())
        ->whereIn('status', ['active', 'on_hold'])
        ->orderBy('name')
        ->pluck('name', 'id'));
    $currentProject = request()->route('project')?->id
        ?? request()->route('task')?->project_id
        ?? (int) request('project_id') ?: null;
@endphp

<button type="button" class="btn-icon text-slate-600 hover:bg-indigo-50 hover:text-indigo-600"
        x-data x-on:click="$dispatch('open-modal', 'quick-create')"
        title="Quick create (n)" aria-label="Quick create">
    <x-icon name="plus" class="h-5 w-5" stroke="2" />
</button>

<x-modal name="quick-create" title="Quick create" max-width="lg">
    <form method="POST" action="{{ route('quick-create') }}" class="space-y-4 p-5">
        @csrf
        <x-form.input name="title" label="Task title" placeholder="What needs to be done?" required autofocus />

        <x-form.field label="Project" name="project_id" required>
            <select name="project_id" class="form-select" required>
                <option value="">Choose a project</option>
                @foreach ($quickProjects as $id => $name)
                    <option value="{{ $id }}" @selected((int) old('project_id', $currentProject) === (int) $id)>{{ $name }}</option>
                @endforeach
            </select>
        </x-form.field>

        <div class="grid gap-4 sm:grid-cols-2">
            <x-form.input name="due_date" label="Due date" type="date" />
            <x-form.select name="priority" label="Priority" :options="\App\Enums\Priority::options()" value="medium" />
        </div>

        <div class="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <a href="{{ route('tasks.create') }}" class="btn-ghost btn-sm mr-auto">More options</a>
            <button type="button" class="btn-secondary" x-on:click="$dispatch('close-modal', 'quick-create')">Cancel</button>
            <button class="btn-primary" type="submit"><x-icon name="plus" class="h-4 w-4" stroke="2" /> Create task</button>
        </div>
    </form>
</x-modal>

{{-- Press "n" anywhere (outside a field) to open quick create. --}}
<div x-data x-on:keydown.window="if ($event.key === 'n' && !/^(INPUT|TEXTAREA|SELECT)$/.test($event.target.tagName) && !$event.target.isContentEditable && !$event.metaKey && !$event.ctrlKey) { $event.preventDefault(); $dispatch('open-modal', 'quick-create') }" class="hidden"></div>
