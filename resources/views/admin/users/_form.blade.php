@php($roleOptions = $roles->pluck('label', 'id')->all())
<div class="space-y-5">
    <div class="grid gap-5 sm:grid-cols-2">
        <x-form.input name="name" label="Full name" :value="$user?->name" required autocomplete="name" />
        <x-form.input name="username" label="Username" :value="$user?->username" required autocomplete="username" />
        <x-form.input name="email" type="email" label="Email address" :value="$user?->email" required autocomplete="email" />
        <x-form.select name="role_id" label="Role" :options="$roleOptions" :value="$user?->role_id" required />
        <x-form.input name="job_title" label="Job title" :value="$user?->job_title" />
        <x-form.input name="department" label="Department" :value="$user?->department" />
        <x-form.select name="avatar_color" label="Avatar color" :options="collect(\App\Models\User::AVATAR_COLORS)->mapWithKeys(fn ($color) => [$color => ucfirst($color)])->all()" :value="$user?->avatar_color ?: 'indigo'" required />
    </div>
    @unless ($isEdit)
        <div class="grid gap-5 border-t border-slate-100 pt-5 sm:grid-cols-2">
            <x-form.input name="password" type="password" label="Temporary password" required autocomplete="new-password" />
            <x-form.input name="password_confirmation" type="password" label="Confirm password" required autocomplete="new-password" />
        </div>
    @endunless
    <div class="flex justify-end border-t border-slate-100 pt-5">
        <button type="submit" class="btn-primary"><x-icon name="check" class="h-4 w-4" /> {{ $isEdit ? 'Save changes' : 'Create user' }}</button>
    </div>
</div>