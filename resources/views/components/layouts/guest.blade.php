@props(['title' => null])
@php $appName = $appName ?? \App\Services\Settings::string('general.app_name'); @endphp
<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" class="h-full">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>{{ $title ? $title.' · ' : '' }}{{ $appName }}</title>
    <link rel="preconnect" href="https://fonts.bunny.net">
    <link href="https://fonts.bunny.net/css?family=inter:400,500,600,700&display=swap" rel="stylesheet" />
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='8' fill='%234f46e5'/><path d='M9 16.5l4.5 4.5L23 11' stroke='white' stroke-width='3' fill='none' stroke-linecap='round' stroke-linejoin='round'/></svg>">
    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>
<body class="h-full">
    <div class="grid min-h-full lg:grid-cols-2">
        <div class="relative hidden overflow-hidden bg-slate-900 lg:flex lg:flex-col lg:justify-between lg:p-12">
            <div class="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-indigo-600/30 blur-3xl"></div>
            <div class="absolute -right-24 -bottom-24 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl"></div>
            <div class="relative flex items-center gap-2.5">
                <span class="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500 text-white">
                    <x-icon name="check" class="h-5 w-5" stroke="2.5" />
                </span>
                <span class="text-xl font-bold text-white">{{ $appName }}</span>
            </div>
            <div class="relative">
                <h2 class="text-3xl leading-tight font-bold text-white">Projects and tasks,<br>simply on track.</h2>
                <p class="mt-4 max-w-md text-slate-300">Plan work, update progress in seconds, spot delays automatically, and give leadership a clear picture — all in one place.</p>
                <ul class="mt-8 space-y-3 text-sm text-slate-300">
                    <li class="flex items-center gap-3"><x-icon name="check-circle" class="h-5 w-5 text-indigo-400" /> Projects → Tasks → Subtasks</li>
                    <li class="flex items-center gap-3"><x-icon name="clock" class="h-5 w-5 text-indigo-400" /> Automatic delay detection</li>
                    <li class="flex items-center gap-3"><x-icon name="chart" class="h-5 w-5 text-indigo-400" /> Executive dashboard &amp; meeting mode</li>
                </ul>
            </div>
            <p class="relative text-xs text-slate-500">&copy; {{ now()->year }} {{ \App\Services\Settings::string('general.organization') }}</p>
        </div>
        <div class="flex items-center justify-center px-4 py-12 sm:px-8">
            <div class="w-full max-w-sm">
                <div class="mb-8 flex items-center gap-2.5 lg:hidden">
                    <span class="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white">
                        <x-icon name="check" class="h-5 w-5" stroke="2.5" />
                    </span>
                    <span class="text-xl font-bold text-slate-900">{{ $appName }}</span>
                </div>
                {{ $slot }}
            </div>
        </div>
    </div>
</body>
</html>
