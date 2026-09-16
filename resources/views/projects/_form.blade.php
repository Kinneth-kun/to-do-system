@php
    // Shared by projects/create and projects/edit. $project is null when creating.
    $project = $project ?? null;
@endphp
@csrf
<div class="grid gap-5 sm:grid-cols-2">
    <x-form.input name="name" label="Project name" :value="$project?->name" required class="sm:col-span-2" />
    <x-form.textarea name="description" label="Description" :value="$project?->description" rows="4" class="sm:col-span-2" />
    @if ($project)
        <x-form.select name="status" label="Status" :options="$statuses" :value="$project->status" required />
    @endif
    <x-form.select name="priority" label="Priority" :options="$priorities" :value="$project?->priority ?? 'medium'" required />
    <x-form.input name="start_date" label="Start date" type="date" :value="$project?->start_date?->format('Y-m-d')" />
    <x-form.input name="due_date" label="Due date" type="date" :value="$project?->due_date?->format('Y-m-d')" help="Must be on or after the start date." />
    <x-form.field label="Colour" name="color" required>
        <select name="color" class="form-select">
            @foreach (\App\Models\Project::COLORS as $color)
                <option value="{{ $color }}" @selected(old('color', $project?->color ?? 'indigo') === $color)>{{ ucfirst($color) }}</option>
            @endforeach
        </select>
    </x-form.field>
    @if (! $project)
        <x-form.field label="Members" name="member_ids" help="Optional — assignees are added automatically later. Hold Ctrl/Cmd to select several.">
            <select name="member_ids[]" multiple class="form-select h-32">
                @foreach ($users as $user)
                    <option value="{{ $user->id }}" @selected(in_array($user->id, (array) old('member_ids', [])))>{{ $user->name }} ({{ '@'.$user->username }})</option>
                @endforeach
            </select>
        </x-form.field>
    @elseif (auth()->user()->isAdmin() || auth()->id() === $project->owner_id)
        <x-form.select name="owner_id" label="Owner" :options="$users->pluck('name', 'id')->all()" :value="$project->owner_id" required />
    @endif
</div>
<div class="mt-6 flex flex-wrap justify-end gap-2">
    <a href="{{ $project ? route('projects.show', $project) : route('projects.index') }}" class="btn-secondary">Cancel</a>
    <button class="btn-primary" type="submit">{{ $project ? 'Save changes' : 'Create project' }}</button>
</div>
