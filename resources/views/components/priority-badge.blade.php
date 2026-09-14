@props(['priority', 'showLow' => true])
@php
    $priority = $priority instanceof \App\Enums\Priority ? $priority : \App\Enums\Priority::tryFrom((string) $priority);
    $c = $priority?->color() ?? 'slate';
@endphp
@if ($priority && ($showLow || $priority !== \App\Enums\Priority::Low))
    <span {{ $attributes->merge(['class' => "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium whitespace-nowrap bg-{$c}-50 text-{$c}-700"]) }}>
        <x-icon name="flag" class="h-3 w-3" stroke="2" />
        {{ $priority->label() }}
    </span>
@endif
