{{--
    Header trigger only. The modals themselves live in partials/modals.blade.php, rendered at the
    end of <body>: the header has `backdrop-blur`, and backdrop-filter makes an element a
    containing block for position:fixed descendants, which traps any modal inside the top bar.
--}}
<button type="button" class="btn-icon text-slate-600 hover:bg-indigo-50 hover:text-indigo-600"
        x-data x-on:click="$dispatch('open-modal', 'quick-create')"
        title="Quick create (n)" aria-label="Quick create">
    <x-icon name="plus" class="h-5 w-5" stroke="2" />
</button>
