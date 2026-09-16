@props([
    'users',
    'name' => 'member_ids',
    'selected' => [],
    'label' => 'Members',
    'help' => 'Optional — choose who should have access to this project. You can add or remove people at any time.',
    'exclude' => null,
])
@php
    $selected = collect(old($name, $selected))->map(fn ($id) => (int) $id)->all();
    $users = collect($users)->reject(fn ($user) => $exclude && (int) $user->id === (int) $exclude)->values();
@endphp
{{--
    Deliberate member selection: a searchable list of real checkboxes, so it works without
    JavaScript. Alpine only adds the filter box and the live count.
--}}
<div x-data="memberPicker(@js($selected))">
    <div class="mb-1 flex items-end justify-between gap-3">
        <label class="form-label mb-0">{{ $label }}</label>
        <span class="text-xs text-slate-500" x-show="count > 0" x-cloak>
            <span x-text="count"></span> selected
            <button type="button" class="ml-1 font-medium text-indigo-600 hover:underline" x-on:click="clear()">Clear</button>
        </span>
    </div>

    <div class="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        @if ($users->count() > 6)
            <div class="relative border-b border-slate-100">
                <x-icon name="search" class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input type="search" placeholder="Search people…" aria-label="Search people"
                       class="w-full border-0 py-2.5 pr-3 pl-9 text-sm placeholder:text-slate-400 focus:ring-0 focus:outline-none"
                       x-model="query">
            </div>
        @endif

        <div class="max-h-60 overflow-y-auto">
            @forelse ($users as $user)
                <label class="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition hover:bg-slate-50"
                       data-search="{{ Str::lower($user->name.' '.$user->username.' '.($user->job_title ?? '').' '.($user->department?->label() ?? '')) }}"
                       x-show="matches($el)" x-cloak>
                    <input type="checkbox" name="{{ $name }}[]" value="{{ $user->id }}" class="form-checkbox shrink-0"
                           @checked(in_array($user->id, $selected, true)) x-on:change="recount()">
                    <x-avatar :user="$user" size="sm" />
                    <span class="min-w-0 flex-1">
                        <span class="block truncate text-sm font-medium text-slate-800">{{ $user->name }}</span>
                        <span class="block truncate text-xs text-slate-500">{{ '@'.$user->username }}{{ $user->job_title ? ' · '.$user->job_title : '' }}</span>
                    </span>
                    @if ($user->department)
                        <x-department-badge :department="$user->department" size="sm" :short="true" class="shrink-0" />
                    @endif
                </label>
            @empty
                <p class="px-3 py-6 text-center text-sm text-slate-500">No other people to add yet.</p>
            @endforelse

            <p class="hidden px-3 py-6 text-center text-sm text-slate-500" x-show="noMatches" x-cloak>
                No one matches “<span x-text="query"></span>”.
            </p>
        </div>
    </div>

    @if ($help)
        <p class="form-help">{{ $help }}</p>
    @endif
    @error($name)<p class="form-error">{{ $message }}</p>@enderror
    @error($name.'.*')<p class="form-error">{{ $message }}</p>@enderror
</div>
