@props(['name', 'title' => null, 'maxWidth' => 'lg', 'show' => false])
@php
    $widths = ['sm' => 'sm:max-w-sm', 'md' => 'sm:max-w-md', 'lg' => 'sm:max-w-lg', 'xl' => 'sm:max-w-xl', '2xl' => 'sm:max-w-2xl', '3xl' => 'sm:max-w-3xl'];
@endphp
{{--
    Open:  $dispatch('open-modal', 'name')   Close: $dispatch('close-modal', 'name')

    Render modals at the end of <body> (see partials/modals.blade.php) — never inside an element
    with backdrop-filter/filter/transform, which becomes the containing block for `fixed` and
    traps the overlay inside it.

    Behaviour lives in resources/js/components/modal.js. Alpine's x-trap.inert is deliberately
    not used: it activates while the panel is still display:none, where focus-trap throws for
    having no tabbable node.

    The root is never display-toggled — it only drops pointer events when closed. Toggling it
    meant the panel's enter transition started inside a display:none parent and stayed hidden.
--}}
<div
    x-data="modal(@js($name), @js((bool) $show))"
    x-on:open-modal.window="onOpenEvent($event)"
    x-on:close-modal.window="onCloseEvent($event)"
    x-on:keydown.escape.window="close()"
    x-on:keydown.tab="retain($event)"
    x-bind:class="show ? '' : 'pointer-events-none'"
    class="fixed inset-0 z-50 overflow-y-auto"
    role="dialog"
    aria-modal="true"
    @if ($title) aria-label="{{ $title }}" @endif
>
    <div x-show="show" x-cloak x-transition.opacity class="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" x-on:click="close()"></div>

    <div class="flex min-h-full items-end justify-center p-0 sm:items-center sm:p-4">
        <div
            x-ref="panel"
            x-show="show"
            x-cloak
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
                    <button type="button" class="btn-icon -mr-2" x-on:click="close()" aria-label="Close">
                        <x-icon name="x" class="h-5 w-5" />
                    </button>
                </div>
            @endif
            {{ $slot }}
        </div>
    </div>
</div>
