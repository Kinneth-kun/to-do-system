@php
    $selectedProjectId = $project?->id ?? ($prefill['project_id'] ?? null);
    $hasProjects = $projects->isNotEmpty();
@endphp
<x-layouts.app title="New Task">
    <x-page-header title="New task" description="Create focused work inside a project." :back="route('tasks.index')" />

    @if (! $hasProjects)
        {{-- Nothing to attach a task to yet: make creating the project the obvious first step. --}}
        <div class="card mx-auto max-w-xl"
             x-data
             x-on:project-created.window="window.location = @js(route('tasks.create')) + '?project_id=' + $event.detail.id">
            <div class="card-body text-center">
                <span class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
                    <x-icon name="folder" class="h-6 w-6" />
                </span>
                <h2 class="text-lg font-semibold tracking-tight text-slate-900">Create a project first</h2>
                <p class="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500">
                    Every task lives inside a project, and you don't have one yet. Create one now — it only needs a
                    name, and you'll come straight back here to add your task.
                </p>
                <div class="mt-5 flex flex-wrap justify-center gap-2">
                    <button type="button" class="btn-primary" x-data x-on:click="$dispatch('open-modal', 'new-project')">
                        <x-icon name="plus" class="h-4 w-4" stroke="2" /> New project
                    </button>
                    <a href="{{ route('projects.create') }}" class="btn-secondary">Use the full project form</a>
                </div>
            </div>
        </div>
    @else
        <form method="POST" action="{{ route('tasks.store') }}" class="card">
            <div class="card-body">
                <div class="mb-5 grid gap-5 sm:grid-cols-2">
                    {{-- Project + inline create --}}
                    <div x-data="projectPicker(@js($selectedProjectId))">
                        <label for="project_id" class="form-label">Project <span class="text-red-500">*</span></label>
                        <div class="flex gap-2">
                            <select id="project_id" name="project_id" class="form-select min-w-0 flex-1" required
                                    x-ref="select" x-model="selected">
                                <option value="">Choose a project</option>
                                @foreach ($projects as $option)
                                    <option value="{{ $option->id }}">{{ $option->name }}</option>
                                @endforeach
                            </select>
                            <button type="button" class="btn-secondary shrink-0 px-3" title="Create a new project"
                                    x-on:click="$dispatch('open-modal', 'new-project')">
                                <x-icon name="plus" class="h-4 w-4" stroke="2" />
                                <span class="sr-only sm:not-sr-only sm:inline">New</span>
                            </button>
                        </div>
                        <p class="form-help">Need a new one? Create it here without losing what you've typed.</p>
                        @error('project_id')<p class="form-error">{{ $message }}</p>@enderror
                    </div>

                    <x-form.select name="parent_id" label="Parent task"
                                   :options="($project?->tasks ?? collect())->pluck('title', 'id')->all()"
                                   :value="$parent?->id ?? ($prefill['parent_id'] ?? null)"
                                   placeholder="Top-level task"
                                   help="Leave empty unless this is a subtask." />
                </div>

                @include('tasks._form')
            </div>
        </form>
    @endif

</x-layouts.app>
