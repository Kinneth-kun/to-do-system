<x-layouts.app title="Edit Task">
    <x-page-header title="Edit task" description="Update the details without changing its history." :back="route('tasks.show', $task)" />
    <form method="POST" action="{{ route('tasks.update', $task) }}" class="card"><div class="card-body">@method('PUT') @include('tasks._form')</div></form>
</x-layouts.app>
