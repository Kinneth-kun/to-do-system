<x-layouts.app title="Add user">
    <x-page-header title="Add user" description="Create an account and assign its access level." :back="route('admin.users.index')" />
    <form method="POST" action="{{ route('admin.users.store') }}" class="card">
        @csrf
        <div class="card-body">@include('admin.users._form', ['user' => null, 'isEdit' => false])</div>
    </form>
</x-layouts.app>