@props(['name' => 'new-project'])
{{--
    Create a project without leaving the page you are on.

    Open it with:   $dispatch('open-modal', 'new-project')
    On success it dispatches a window event `project-created` with { id, name, color, url },
    which the task forms listen for to add and select the new project in place.

    Without JavaScript the form still posts normally: `return_to` sends the browser back to
    this page with ?project_id= set, so the flow still works.
--}}
<x-modal :name="$name" title="New project" max-width="lg">
    <form method="POST" action="{{ route('projects.store') }}" class="space-y-4 p-5"
          x-data="newProjectForm(@js($name))" x-on:submit="submit($event)">
        @csrf
        <input type="hidden" name="return_to" value="{{ request()->getRequestUri() }}">

        <p class="text-sm text-slate-500">Every task belongs to a project. Create one here and it will be selected for you.</p>

        <div>
            <label for="{{ $name }}-name" class="form-label">Project name <span class="text-red-500">*</span></label>
            <input id="{{ $name }}-name" name="name" type="text" class="form-input" required maxlength="255"
                   placeholder="e.g. Tenant Move-In 2026" x-ref="name" x-bind:class="errors.name && 'border-red-400'">
            <p class="form-error" x-show="errors.name" x-cloak x-text="errors.name"></p>
        </div>

        <div>
            <label for="{{ $name }}-description" class="form-label">Description <span class="font-normal text-slate-400">(optional)</span></label>
            <textarea id="{{ $name }}-description" name="description" rows="2" class="form-input" maxlength="10000"
                      placeholder="What is this project for?"></textarea>
            <p class="form-error" x-show="errors.description" x-cloak x-text="errors.description"></p>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
            <div>
                <label for="{{ $name }}-start" class="form-label">Start date</label>
                <input id="{{ $name }}-start" name="start_date" type="date" class="form-input">
                <p class="form-error" x-show="errors.start_date" x-cloak x-text="errors.start_date"></p>
            </div>
            <div>
                <label for="{{ $name }}-due" class="form-label">Due date</label>
                <input id="{{ $name }}-due" name="due_date" type="date" class="form-input">
                <p class="form-error" x-show="errors.due_date" x-cloak x-text="errors.due_date"></p>
            </div>
        </div>

        <div class="flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <p class="mr-auto text-xs text-slate-400">You can set priority, colour and members later.</p>
            <button type="button" class="btn-secondary" x-on:click="$dispatch('close-modal', @js($name))" x-bind:disabled="saving">Cancel</button>
            <button type="submit" class="btn-primary" x-bind:disabled="saving">
                <x-icon name="plus" class="h-4 w-4" stroke="2" />
                <span x-text="saving ? 'Creating…' : 'Create project'">Create project</span>
            </button>
        </div>
    </form>
</x-modal>
