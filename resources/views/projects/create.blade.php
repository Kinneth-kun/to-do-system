<x-layouts.app title="New Project">
    <x-page-header title="New project" description="Set up a workspace for related tasks." :back="route('projects.index')" />
    <form method="POST" action="{{ route('projects.store') }}" class="card"><div class="card-body">@include('projects._form')</div></form>
</x-layouts.app>
