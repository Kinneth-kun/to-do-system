{{-- Placeholder: the Search module replaces this with a live-suggest search box. --}}
<form method="GET" action="{{ route('search') }}" class="relative w-full max-w-xl" role="search">
    <x-icon name="search" class="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400" />
    <input type="search" name="q" value="{{ request()->routeIs('search') ? request('q') : '' }}" placeholder="Search projects, tasks, people…"
           class="form-input border-slate-200 bg-slate-100/70 pl-9 shadow-none focus:bg-white" x-on:focus-search.window="$el.focus()">
</form>
