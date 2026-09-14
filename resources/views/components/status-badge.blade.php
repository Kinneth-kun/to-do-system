@props(['status', 'size' => 'md'])
@php
    $status = $status instanceof \App\Enums\TaskStatus ? $status : \App\Enums\TaskStatus::tryFrom((string) $status);
    $c = $status?->color() ?? 'slate';
    $sizes = ['sm' => 'px-1.5 py-0.5 text-[11px]', 'md' => 'px-2 py-0.5 text-xs', 'lg' => 'px-2.5 py-1 text-sm'];
@endphp
<span {{ $attributes->merge(['class' => "inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap bg-{$c}-50 text-{$c}-700 ring-1 ring-inset ring-{$c}-200 ".($sizes[$size] ?? $sizes['md'])]) }}>
    <span class="h-1.5 w-1.5 rounded-full bg-{{ $c }}-500"></span>
    {{ $status?->label() ?? 'Unknown' }}
</span>
