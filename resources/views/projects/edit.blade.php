<x-layouts.app title="Edit Project">
    <x-page-header title="Edit project" description="Keep the project details current." :back="route('projects.show', $project)" />
    <form method="POST" action="{{ route('projects.update', $project) }}" class="card"><div class="card-body">@method('PUT') @include('projects._form')</div></form>
</x-layouts.app>
