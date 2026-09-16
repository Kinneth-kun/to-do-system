<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>Sign in · {{ config('app.name') }}</title>
    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body class="min-h-screen bg-slate-100 text-slate-800 antialiased">
    <main class="flex min-h-screen items-center justify-center px-4 py-12">
        <div class="w-full max-w-md">
            <div class="mb-8 flex items-center justify-center gap-2.5">
                <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-xl font-bold text-white shadow-lg shadow-indigo-600/25">✓</span>
                <span class="text-2xl font-bold tracking-tight text-slate-900">{{ config('app.name') }}</span>
            </div>

            <section class="card overflow-hidden">
                <div class="border-b border-slate-100 px-6 py-5 sm:px-8">
                    <h1 class="text-xl font-semibold text-slate-900">Welcome back</h1>
                    <p class="mt-1 text-sm text-slate-500">Sign in to continue to your workspace.</p>
                </div>

                <form method="POST" action="{{ route('login.store') }}" class="space-y-5 px-6 py-6 sm:px-8">
                    @csrf

                    <div>
                        <label for="login" class="form-label">Email or username</label>
                        <input id="login" name="login" type="text" value="{{ old('login') }}" required autofocus autocomplete="username" class="form-input">
                        @error('login')
                            <p class="form-error">{{ $message }}</p>
                        @enderror
                    </div>

                    <div>
                        <label for="password" class="form-label">Password</label>
                        <input id="password" name="password" type="password" required autocomplete="current-password" class="form-input">
                        @error('password')
                            <p class="form-error">{{ $message }}</p>
                        @enderror
                    </div>

                    <label class="flex items-center gap-2 text-sm text-slate-600">
                        <input type="checkbox" name="remember" value="1" class="form-checkbox">
                        Remember me
                    </label>

                    <button type="submit" class="btn-primary w-full">Sign in</button>
                </form>
            </section>
        </div>
    </main>
</body>
</html>