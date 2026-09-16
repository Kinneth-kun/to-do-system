<x-layouts.app title="Edit user">
    <x-page-header title="Edit user" description="Update access and account details for {{ $user->name }}." :back="route('admin.users.index')">
        <x-slot:meta><p class="mt-2 text-xs text-slate-500">Created {{ $user->created_at?->format('M j, Y') }}</p></x-slot:meta>
    </x-page-header>

    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <form method="POST" action="{{ route('admin.users.update', $user) }}" class="card">
            @csrf
            @method('PUT')
            <div class="card-body">@include('admin.users._form', ['isEdit' => true])</div>
        </form>

        <section class="card h-fit">
            <div class="card-header">
                <h2 class="card-title">Reset password</h2>
                <p class="mt-1 text-sm text-slate-500">This also clears any active login lock.</p>
            </div>
            <form method="POST" action="{{ route('admin.users.password', $user) }}" class="card-body space-y-5">
                @csrf
                @method('PUT')
                <x-form.input name="password" type="password" label="New password" required autocomplete="new-password" />
                <x-form.input name="password_confirmation" type="password" label="Confirm new password" required autocomplete="new-password" />
                <button type="submit" class="btn-secondary w-full justify-center"><x-icon name="key" class="h-4 w-4" /> Reset password</button>
            </form>
        </section>
    </div>
</x-layouts.app>