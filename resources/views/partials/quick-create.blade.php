@php
    // Global quick create. Minimal fields only — "More options" opens the full form.
    // Errors live in their own bag so a failed page form never lights up this modal.
    $quickProjects = once(fn () => \App\Models\Project::query()
        ->visibleTo(auth()->user())
        ->whereIn('status', ['active', 'on_hold'])
        ->orderBy('name')
        ->pluck('name', 'id'));
    $currentProject = request()->route('project')?->id
        ?? request()->route('task')?->project_id
        ?? (int) request('project_id') ?: null;
    $quickErrors = $errors->getBag('quickCreate');
@endphp

<button type="button" class="btn-icon text-slate-600 hover:bg-indigo-50 hover:text-indigo-600"
        x-data x-on:click="$dispatch('open-modal', 'quick-create')"
        title="Quick create (n)" aria-label="Quick create">
    <x-icon name="plus" class="h-5 w-5" stroke="2" />
</button>

<x-modal name="quick-create" title="Quick create" max-width="lg" :show="$quickErrors->any()">
    <form method="POST" action="{{ route('quick-create') }}" class="space-y-4 p-5">
        @csrf

        <div>
            <label for="quick-title" class="form-label">Task title <span class="text-red-500">*</span></label>
            <input id="quick-title" name="title" type="text" class="form-input @if ($quickErrors->has('title')) border-red-400 @endif"
                   value="{{ old('title') }}" placeholder="What needs to be done?" required maxlength="255">
            @if ($quickErrors->has('title'))
                <p class="form-error">{{ $quickErrors->first('title') }}</p>
            @endif
        </div>

        <div x-data="projectPicker(@js($currentProject))">
            <label for="quick-project" class="form-label">Project <span class="text-red-500">*</span></label>
            <div class="flex gap-2">
                <select id="quick-project" name="project_id" class="form-select min-w-0 flex-1" required x-ref="select" x-model="selected">
                    <option value="">Choose a project</option>
                    @foreach ($quickProjects as $id => $name)
                        <option value="{{ $id }}">{{ $name }}</option>
                    @endforeach
                </select>
                <button type="button" class="btn-secondary shrink-0 px-3" title="Create a new project"
                        x-on:click="$dispatch('close-modal', 'quick-create'); $dispatch('open-modal', 'new-project')">
                    <x-icon name="plus" class="h-4 w-4" stroke="2" />
                    <span class="sr-only">New project</span>
                </button>
            </div>
            @if ($quickProjects->isEmpty())
                <p class="form-help">You don't have a project yet — create one with the + button.</p>
            @endif
            @if ($quickErrors->has('project_id'))
                <p class="form-error">{{ $quickErrors->first('project_id') }}</p>
            @endif
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
            <div>
                <label for="quick-due" class="form-label">Due date</label>
                <input id="quick-due" name="due_date" type="date" class="form-input" value="{{ old('due_date') }}">
                @if ($quickErrors->has('due_date'))
                    <p class="form-error">{{ $quickErrors->first('due_date') }}</p>
                @endif
            </div>
            <div>
                <label for="quick-priority" class="form-label">Priority</label>
                <select id="quick-priority" name="priority" class="form-select">
                    @foreach (\App\Enums\Priority::options() as $value => $label)
                        <option value="{{ $value }}" @selected(old('priority', 'medium') === $value)>{{ $label }}</option>
                    @endforeach
                </select>
            </div>
        </div>

        <div class="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <a href="{{ route('tasks.create') }}" class="btn-ghost btn-sm mr-auto">More options</a>
            <button type="button" class="btn-secondary" x-on:click="$dispatch('close-modal', 'quick-create')">Cancel</button>
            <button class="btn-primary" type="submit"><x-icon name="plus" class="h-4 w-4" stroke="2" /> Create task</button>
        </div>
    </form>
</x-modal>

{{-- Rendered once per page (this partial is in the layout) and shared by every project picker. --}}
<x-new-project-modal />

{{-- Press "n" anywhere (outside a field) to open quick create. --}}
<div x-data x-on:keydown.window="if ($event.key === 'n' && !/^(INPUT|TEXTAREA|SELECT)$/.test($event.target.tagName) && !$event.target.isContentEditable && !$event.metaKey && !$event.ctrlKey) { $event.preventDefault(); $dispatch('open-modal', 'quick-create') }" class="hidden"></div>
