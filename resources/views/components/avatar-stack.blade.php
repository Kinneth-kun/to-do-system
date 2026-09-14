@props(['users' => [], 'max' => 4, 'size' => 'sm'])
@php
    $users = collect($users)->filter()->values();
    $extra = max(0, $users->count() - $max);
@endphp
<div {{ $attributes->merge(['class' => 'flex -space-x-1.5']) }}>
    @foreach ($users->take($max) as $u)
        <x-avatar :user="$u" :size="$size" />
    @endforeach
    @if ($extra > 0)
        <span class="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600 ring-2 ring-white" title="{{ $users->slice($max)->pluck('name')->implode(', ') }}">+{{ $extra }}</span>
    @endif
</div>
