@props(['value' => 0, 'size' => 'md', 'color' => null, 'showLabel' => false])
@php
    $value = max(0, min(100, (int) $value));
    $color ??= match (true) {
        $value >= 100 => 'emerald',
        $value >= 60 => 'indigo',
        $value > 0 => 'blue',
        default => 'slate',
    };
    $heights = ['xs' => 'h-1', 'sm' => 'h-1.5', 'md' => 'h-2', 'lg' => 'h-3'];
@endphp
<div {{ $attributes->merge(['class' => 'flex items-center gap-2']) }}>
    <div class="w-full overflow-hidden rounded-full bg-slate-100 {{ $heights[$size] ?? $heights['md'] }}" role="progressbar" aria-valuenow="{{ $value }}" aria-valuemin="0" aria-valuemax="100">
        <div class="h-full rounded-full bg-{{ $color }}-500 transition-all duration-500" style="width: {{ $value }}%"></div>
    </div>
    @if ($showLabel)
        <span class="w-9 shrink-0 text-right text-xs font-medium text-slate-600 tabular-nums">{{ $value }}%</span>
    @endif
</div>
