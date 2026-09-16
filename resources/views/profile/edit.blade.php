<x-layouts.app title="My profile">
    <x-page-header title="My profile" description="Manage your account details and password." />

    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section class="card">
            <div class="card-header flex items-center gap-4">
                <x-avatar :user="$user" size="lg" />
                <div>
                    <h2 class="card-title">Profile details</h2>
                    <p class="mt-1 text-sm text-slate-500">Your name and contact details are visible to your teammates.</p>
                </div>
            </div>
            <form method="POST" action="{{ route('profile.update') }}" class="card-body space-y-5">
                @csrf
                @method('PUT')
                <div class="grid gap-5 sm:grid-cols-2">
                    <x-form.input name="name" label="Full name" :value="$user->name" required autocomplete="name" />
                    <x-form.input name="username" label="Username" :value="$user->username" required autocomplete="username" help="Used for mentions such as @username." />
                    <x-form.input name="email" type="email" label="Email address" :value="$user->email" required autocomplete="email" />
                    <x-form.input name="job_title" label="Job title" :value="$user->job_title" autocomplete="organization-title" />
                    <x-form.select name="department" label="Department" :options="\App\Enums\Department::options()" :value="$user->department" placeholder="Select a department" required />
                    <x-form.select name="avatar_color" label="Avatar color" :options="collect(\App\Models\User::AVATAR_COLORS)->mapWithKeys(fn ($color) => [$color => ucfirst($color)])->all()" :value="$user->avatar_color" required />
                </div>
                <div class="flex justify-end border-t border-slate-100 pt-5">
                    <button type="submit" class="btn-primary"><x-icon name="check" class="h-4 w-4" /> Save changes</button>
                </div>
            </form>
        </section>

        <section class="card h-fit">
            <div class="card-header">
                <h2 class="card-title">Change password</h2>
                <p class="mt-1 text-sm text-slate-500">Use a password you do not use elsewhere.</p>
            </div>
            <form method="POST" action="{{ route('profile.password') }}" class="card-body space-y-5">
                @csrf
                @method('PUT')
                <x-form.input name="current_password" type="password" label="Current password" required autocomplete="current-password" />
                <x-form.input name="password" type="password" label="New password" required autocomplete="new-password" />
                <x-form.input name="password_confirmation" type="password" label="Confirm new password" required autocomplete="new-password" />
                <button type="submit" class="btn-secondary w-full justify-center"><x-icon name="lock" class="h-4 w-4" /> Change password</button>
            </form>
        </section>
    </div>
</x-layouts.app>