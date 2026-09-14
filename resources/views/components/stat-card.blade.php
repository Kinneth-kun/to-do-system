@props(['label', 'value', 'icon' => 'chart', 'color' => 'indigo', 'href' => null, 'hint' => null])
@php $tag = $href ? 'a' : 'div'; @endphp
<{{ $tag }} @if ($href) href="{{ $href }}" @endif {{ $attributes->merge(['class' => 'card group flex items-center gap-4 p-4 transition '.($href ? 'hover:border-'.$color.'-200 hover:shadow-md' : '')]) }}>
    <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-{{ $color }}-50 text-{{ $color }}-600">
        <x-icon :name="$icon" class="h-5 w-5" />
    </span>
    <div class="min-w-0">
        <div class="text-2xl font-bold text-slate-900 tabular-nums">{{ $value }}</div>
        <div class="truncate text-xs font-medium text-slate-500">{{ $label }}</div>
        @if ($hint)
            <div class="truncate text-[11px] text-slate-400">{{ $hint }}</div>
        @endif
    </div>
</{{ $tag }}>
