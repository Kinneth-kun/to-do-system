@props(['align' => 'right', 'width' => 'w-56'])
@php
    $alignment = $align === 'left' ? 'left-0 origin-top-left' : 'right-0 origin-top-right';
@endphp
<div class="relative" x-data="{ open: false }" x-on:click.outside="open = false" x-on:keydown.escape.window="open = false">
    <div x-on:click="open = !open">{{ $trigger }}</div>
    <div
        x-show="open"
        x-cloak
        x-transition:enter="transition ease-out duration-100"
        x-transition:enter-start="opacity-0 scale-95"
        x-transition:enter-end="opacity-100 scale-100"
        x-transition:leave="transition ease-in duration-75"
        x-transition:leave-start="opacity-100 scale-100"
        x-transition:leave-end="opacity-0 scale-95"
        class="absolute z-40 mt-2 {{ $width }} {{ $alignment }} rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        x-on:click="open = false"
    >
        {{ $slot }}
    </div>
</div>
