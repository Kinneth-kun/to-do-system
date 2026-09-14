@props(['status'])
@php
    $status = $status instanceof \App\Enums\ProjectStatus ? $status : \App\Enums\ProjectStatus::tryFrom((string) $status);
    $c = $status?->color() ?? 'slate';
@endphp
<span {{ $attributes->merge(['class' => "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap bg-{$c}-50 text-{$c}-700 ring-1 ring-inset ring-{$c}-200"]) }}>
    {{ $status?->label() ?? 'Unknown' }}
</span>
