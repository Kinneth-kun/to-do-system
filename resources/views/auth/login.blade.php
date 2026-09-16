<x-layouts.guest title="Sign in">
    <div class="mb-8">
        <h1 class="text-2xl font-semibold tracking-tight text-slate-900">Welcome back</h1>
        <p class="mt-1.5 text-sm text-slate-500">Sign in to continue to your workspace.</p>
    </div>

    @if ($errors->any() && ! $errors->has('login') && ! $errors->has('password'))
        <div class="mb-5 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <x-icon name="alert" class="mt-0.5 h-4 w-4 shrink-0" />
            <span>{{ $errors->first() }}</span>
        </div>
    @endif

    @if (session('status'))
        <div class="mb-5 flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            <x-icon name="check-circle" class="mt-0.5 h-4 w-4 shrink-0" />
            <span>{{ session('status') }}</span>
        </div>
    @endif

    <form method="POST" action="{{ route('login.store') }}" class="space-y-5">
        @csrf

        <div>
            <label for="login" class="form-label">Email or username</label>
            <input id="login" name="login" type="text" value="{{ old('login') }}" required autofocus autocomplete="username"
                   placeholder="you@company.com" class="form-input @error('login') border-red-400 @enderror">
            @error('login')<p class="form-error">{{ $message }}</p>@enderror
        </div>

        <div>
            <label for="password" class="form-label">Password</label>
            <div class="relative" x-data="{ show: false }">
                <input id="password" name="password" x-bind:type="show ? 'text' : 'password'" required autocomplete="current-password"
                       placeholder="••••••••" class="form-input pr-10 @error('password') border-red-400 @enderror">
                <button type="button" x-on:click="show = !show" tabindex="-1"
                        class="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-600"
                        x-bind:aria-label="show ? 'Hide password' : 'Show password'">
                    <x-icon name="eye" class="h-4 w-4" />
                </button>
            </div>
            @error('password')<p class="form-error">{{ $message }}</p>@enderror
        </div>

        <label class="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" name="remember" value="1" class="form-checkbox" @checked(old('remember'))>
            Keep me signed in
        </label>

        <button type="submit" class="btn-primary w-full py-2.5">Sign in</button>
    </form>

    @if (app()->environment('local'))
        <div class="mt-8 rounded-lg border border-dashed border-slate-300 bg-slate-50/80 p-3.5">
            <p class="eyebrow mb-2">Demo accounts</p>
            <dl class="space-y-1 text-xs text-slate-600">
                <div class="flex justify-between gap-3">
                    <dt>Administrator</dt>
                    <dd class="font-mono text-slate-800">admin@taskflow.test</dd>
                </div>
                <div class="flex justify-between gap-3">
                    <dt>Team member</dt>
                    <dd class="font-mono text-slate-800">maria@taskflow.test</dd>
                </div>
                <div class="flex justify-between gap-3 border-t border-slate-200 pt-1">
                    <dt>Password</dt>
                    <dd class="font-mono text-slate-800">password</dd>
                </div>
            </dl>
        </div>
    @endif

    <p class="mt-8 text-center text-xs text-slate-400">
        Need access? Ask your administrator to create an account.
    </p>
</x-layouts.guest>
