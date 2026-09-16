@props([
    'value' => 0,
    'size' => 132,
    'stroke' => 10,
    'color' => null,
    'label' => null,
    'sublabel' => null,
])
@php
    $value = max(0, min(100, (int) $value));
    $color ??= match (true) {
        $value >= 100 => 'emerald',
        $value >= 60 => 'indigo',
        $value > 0 => 'blue',
        default => 'slate',
    };
    $radius = ($size - $stroke) / 2;
    $circumference = 2 * M_PI * $radius;
    $offset = $circumference * (1 - $value / 100);
@endphp
<div {{ $attributes->merge(['class' => 'relative inline-flex shrink-0 items-center justify-center']) }} style="width: {{ $size }}px; height: {{ $size }}px;">
    <svg width="{{ $size }}" height="{{ $size }}" viewBox="0 0 {{ $size }} {{ $size }}" class="-rotate-90" role="img"
         aria-label="{{ $label ?? $value.'% complete' }}">
        <circle cx="{{ $size / 2 }}" cy="{{ $size / 2 }}" r="{{ $radius }}" fill="none" stroke-width="{{ $stroke }}" class="stroke-slate-100" />
        <circle cx="{{ $size / 2 }}" cy="{{ $size / 2 }}" r="{{ $radius }}" fill="none" stroke-width="{{ $stroke }}" stroke-linecap="round"
                class="stroke-{{ $color }}-500 transition-all duration-700"
                stroke-dasharray="{{ $circumference }}" stroke-dashoffset="{{ $offset }}" />
    </svg>
    <div class="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span class="text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">{{ $value }}<span class="text-base text-slate-400">%</span></span>
        @if ($sublabel)
            <span class="mt-0.5 max-w-[80%] text-[11px] leading-tight text-slate-500">{{ $sublabel }}</span>
        @endif
    </div>
</div>
