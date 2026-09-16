<x-layouts.app title="New Task">
    <x-page-header title="New task" description="Create focused work inside a project." :back="route('tasks.index')" />
    <form method="POST" action="{{ route('tasks.store') }}" class="card"><div class="card-body"><div class="mb-5 grid gap-5 sm:grid-cols-2"><x-form.select name="project_id" label="Project" :options="$projects->pluck('name', 'id')->all()" :value="$project?->id ?? ($prefill['project_id'] ?? null)" placeholder="Choose a project" required /><x-form.select name="parent_id" label="Parent task" :options="($project?->tasks ?? collect())->pluck('title', 'id')->all()" :value="$parent?->id ?? ($prefill['parent_id'] ?? null)" placeholder="Top-level task" /></div>@include('tasks._form')</div></form>
</x-layouts.app>
