@props(['name', 'title' => null, 'maxWidth' => 'lg', 'show' => false])
@php
    $widths = ['sm' => 'sm:max-w-sm', 'md' => 'sm:max-w-md', 'lg' => 'sm:max-w-lg', 'xl' => 'sm:max-w-xl', '2xl' => 'sm:max-w-2xl', '3xl' => 'sm:max-w-3xl'];
@endphp
{{--
    Open:  $dispatch('open-modal', 'name')   Close: $dispatch('close-modal', 'name')  or  x-on:click="show = false"
--}}
<div
    x-data="{ show: @js((bool) $show) }"
    x-on:open-modal.window="if ($event.detail === @js($name)) show = true"
    x-on:close-modal.window="if ($event.detail === @js($name)) show = false"
    x-on:keydown.escape.window="show = false"
    x-show="show"
    x-cloak
    class="fixed inset-0 z-50 overflow-y-auto"
    role="dialog"
    aria-modal="true"
>
    <div x-show="show" x-transition.opacity class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" x-on:click="show = false"></div>
    <div class="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
        <div
            x-show="show"
            x-trap.inert.noscroll="show"
            x-transition:enter="ease-out duration-200"
            x-transition:enter-start="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            x-transition:enter-end="opacity-100 translate-y-0 sm:scale-100"
            x-transition:leave="ease-in duration-150"
            x-transition:leave-start="opacity-100 translate-y-0 sm:scale-100"
            x-transition:leave-end="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            {{ $attributes->merge(['class' => 'relative w-full rounded-t-2xl bg-white shadow-xl sm:rounded-2xl '.($widths[$maxWidth] ?? $widths['lg'])]) }}
        >
            @if ($title)
                <div class="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                    <h2 class="text-base font-semibold text-slate-900">{{ $title }}</h2>
                    <button type="button" class="btn-icon -mr-2" x-on:click="show = false" aria-label="Close">
                        <x-icon name="x" class="h-5 w-5" />
                    </button>
                </div>
            @endif
            {{ $slot }}
        </div>
    </div>
</div>
