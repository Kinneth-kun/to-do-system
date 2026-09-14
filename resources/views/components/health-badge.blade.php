@props(['health', 'size' => 'md'])
@php
    $health = $health instanceof \App\Enums\ProjectHealth ? $health : \App\Enums\ProjectHealth::tryFrom((string) $health);
    $c = $health?->color() ?? 'slate';
    $sizes = ['sm' => 'px-1.5 py-0.5 text-[11px]', 'md' => 'px-2 py-0.5 text-xs', 'lg' => 'px-3 py-1 text-sm'];
@endphp
<span {{ $attributes->merge(['class' => "inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap bg-{$c}-100 text-{$c}-700 ".($sizes[$size] ?? $sizes['md'])]) }}>
    <span class="h-2 w-2 rounded-full bg-{{ $c }}-500"></span>
    {{ $health?->label() ?? 'Unknown' }}
</span>
