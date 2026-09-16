@php
    // Shared by tasks/create and tasks/edit. $task is null when creating.
    $task = $task ?? null;
    $prefill = $prefill ?? [];
@endphp
@csrf
<div class="grid gap-5 sm:grid-cols-2">
    <x-form.input name="title" label="Title" :value="$task?->title" required class="sm:col-span-2" />
    <x-form.textarea name="description" label="Description" :value="$task?->description" rows="5" class="sm:col-span-2" />
    <x-form.select name="priority" label="Priority" :options="$priorities" :value="$task?->priority ?? 'medium'" required />
    <x-form.select name="assignee_id" label="Assignee" :options="$users->pluck('name', 'id')->all()"
        :value="$task?->assignee_id ?? ($prefill['assignee_id'] ?? null)" placeholder="Unassigned"
        help="They are added to the project automatically." />
    <x-form.input name="start_date" label="Start date" type="date" :value="$task?->start_date?->format('Y-m-d')" />
    <x-form.input name="due_date" label="Due date" type="date"
        :value="$task?->due_date?->format('Y-m-d') ?? ($prefill['due_date'] ?? null)" help="Overdue tasks are marked Delayed automatically." />
</div>
<div class="mt-6 flex flex-wrap justify-end gap-2">
    <a href="{{ $task ? route('tasks.show', $task) : route('tasks.index') }}" class="btn-secondary">Cancel</a>
    <button class="btn-primary" type="submit">{{ $task ? 'Save changes' : 'Create task' }}</button>
</div>
