@props(['user' => null, 'size' => 'sm', 'title' => true])
@php
    $sizes = ['xs' => 'h-5 w-5 text-[9px]', 'sm' => 'h-7 w-7 text-[11px]', 'md' => 'h-9 w-9 text-sm', 'lg' => 'h-12 w-12 text-base', 'xl' => 'h-16 w-16 text-xl'];
    $c = $user?->avatar_color ?: 'slate';
@endphp
@if ($user)
    <span {{ $attributes->merge(['class' => "inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ring-white bg-{$c}-100 text-{$c}-700 ".($sizes[$size] ?? $sizes['sm'])]) }} @if ($title) title="{{ $user->name }}" @endif>
        {{ $user->initials() }}
    </span>
@else
    <span {{ $attributes->merge(['class' => 'inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-slate-300 bg-white text-slate-400 '.($sizes[$size] ?? $sizes['sm'])]) }} title="Unassigned">
        <x-icon name="user" class="h-3/5 w-3/5" />
    </span>
@endif
