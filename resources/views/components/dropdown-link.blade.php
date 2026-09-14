@props(['href' => '#', 'icon' => null, 'danger' => false])
<a href="{{ $href }}" {{ $attributes->merge(['class' => 'flex items-center gap-2 px-3 py-2 text-sm '.($danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50')]) }}>
    @if ($icon)
        <x-icon :name="$icon" class="h-4 w-4 opacity-70" />
    @endif
    {{ $slot }}
</a>
