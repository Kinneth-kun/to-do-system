@php
    $needsAttention = $tasks->filter(fn ($task) => $task->status === \App\Enums\TaskStatus::Delayed || $task->isOverdue() || $task->isDueSoon())->values();
    $upcoming = $tasks->reject(fn ($task) => $needsAttention->contains('id', $task->id))->take(8);
@endphp
<x-layouts.app title="Meeting Mode" :bare="true">
    <div class="min-h-screen bg-slate-950 text-white">
        {{-- Presentation header --}}
        <header class="sticky top-0 z-10 border-b border-white/10 bg-slate-950/90 backdrop-blur print:hidden">
            <div class="mx-auto flex max-w-[110rem] flex-wrap items-center justify-between gap-4 px-6 py-4 sm:px-10">
                <div class="flex items-center gap-3">
                    <span class="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500">
                        <x-icon name="presentation" class="h-5 w-5" />
                    </span>
                    <div>
                        <p class="text-xs font-medium tracking-wide text-indigo-300 uppercase">{{ $organization }}</p>
                        <h1 class="text-lg font-semibold tracking-tight">Project review</h1>
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <span class="hidden text-sm text-slate-400 sm:inline">{{ now()->format('l, F j, Y') }}</span>
                    <button type="button" class="btn btn-sm border border-white/15 text-slate-200 hover:bg-white/10"
                            x-data x-on:click="document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()">
                        <x-icon name="expand" class="h-4 w-4" /> Fullscreen
                    </button>
                    <a href="{{ route('admin.executive') }}" class="btn btn-sm border border-white/15 text-slate-200 hover:bg-white/10">Exit</a>
                </div>
            </div>
        </header>

        <main class="mx-auto max-w-[110rem] space-y-12 px-6 py-10 sm:px-10">
            {{-- 1. Project overview --}}
            <section>
                <div class="mb-5 flex items-baseline gap-3">
                    <span class="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-sm font-semibold">1</span>
                    <h2 class="text-2xl font-semibold tracking-tight">Project overview</h2>
                    <span class="text-sm text-slate-500">{{ $projects->count() }} active</span>
                </div>
                <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    @forelse ($projects as $project)
                        <article class="rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition hover:bg-white/[0.07]">
                            <div class="flex items-start justify-between gap-3">
                                <h3 class="min-w-0 flex-1 truncate text-lg font-semibold">{{ $project->name }}</h3>
                                <span class="chip shrink-0 bg-{{ $project->health->color() }}-500/15 text-{{ $project->health->color() }}-300">
                                    <span class="h-1.5 w-1.5 rounded-full bg-{{ $project->health->color() }}-400"></span>
                                    {{ $project->health->label() }}
                                </span>
                            </div>
                            <p class="mt-1 truncate text-sm text-slate-400">{{ $project->owner?->name }}</p>

                            <div class="mt-5 flex items-end justify-between gap-3">
                                <span class="text-3xl font-semibold tracking-tight tabular-nums">{{ $project->progress }}<span class="text-lg text-slate-500">%</span></span>
                                <span class="pb-1 text-xs text-slate-400">
                                    {{ $project->due_date ? 'Due '.$project->due_date->format('M j, Y') : 'No due date' }}
                                </span>
                            </div>
                            <div class="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                                <div class="h-full rounded-full bg-{{ $project->health->color() }}-400 transition-all duration-700" style="width: {{ $project->progress }}%"></div>
                            </div>
                        </article>
                    @empty
                        <p class="text-slate-400">No active projects.</p>
                    @endforelse
                </div>
            </section>

            {{-- 2. Needs attention --}}
            <section>
                <div class="mb-5 flex items-baseline gap-3">
                    <span class="flex h-7 w-7 items-center justify-center rounded-full bg-red-500/20 text-sm font-semibold text-red-300">2</span>
                    <h2 class="text-2xl font-semibold tracking-tight">Needs attention</h2>
                    <span class="text-sm text-slate-500">{{ $needsAttention->count() }} {{ Str::plural('item', $needsAttention->count()) }}</span>
                </div>
                @if ($needsAttention->isEmpty())
                    <div class="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-8 text-center">
                        <x-icon name="check-circle" class="mx-auto h-8 w-8 text-emerald-400" />
                        <p class="mt-3 text-lg font-medium text-emerald-200">Nothing needs attention</p>
                        <p class="mt-1 text-sm text-slate-400">No delayed or imminent work across the portfolio.</p>
                    </div>
                @else
                    <div class="grid gap-3 lg:grid-cols-2">
                        @foreach ($needsAttention as $task)
                            <a href="{{ route('tasks.show', $task) }}" class="flex items-start gap-4 rounded-xl border border-white/10 bg-white/[0.04] p-4 transition hover:bg-white/[0.08]">
                                <span class="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-{{ $task->status->color() }}-400"></span>
                                <div class="min-w-0 flex-1">
                                    <p class="truncate text-base font-medium">{{ $task->title }}</p>
                                    <p class="mt-0.5 truncate text-sm text-slate-400">
                                        {{ $task->project?->name }} · {{ $task->assignee?->name ?? 'Unassigned' }}
                                    </p>
                                    @if ($task->latest_remark)
                                        <p class="mt-2 line-clamp-2 text-sm text-slate-300 italic">“{{ $task->latest_remark }}”</p>
                                    @endif
                                </div>
                                <div class="shrink-0 text-right">
                                    <p @class(['text-sm font-semibold', 'text-red-300' => $task->isOverdue() || $task->status === \App\Enums\TaskStatus::Delayed, 'text-amber-300' => ! $task->isOverdue() && $task->status !== \App\Enums\TaskStatus::Delayed])>
                                        {{ $task->dueLabel() ?? '—' }}
                                    </p>
                                    <p class="mt-1 text-xs text-slate-500 tabular-nums">{{ $task->progress }}%</p>
                                </div>
                            </a>
                        @endforeach
                    </div>
                @endif
            </section>

            {{-- 3. Upcoming work --}}
            <section>
                <div class="mb-5 flex items-baseline gap-3">
                    <span class="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-sm font-semibold">3</span>
                    <h2 class="text-2xl font-semibold tracking-tight">Upcoming work</h2>
                </div>
                <div class="overflow-hidden rounded-2xl border border-white/10">
                    @forelse ($upcoming as $task)
                        <a href="{{ route('tasks.show', $task) }}" class="flex items-center gap-4 border-b border-white/5 bg-white/[0.02] px-5 py-3.5 transition last:border-0 hover:bg-white/[0.06]">
                            <span class="h-2 w-2 shrink-0 rounded-full bg-{{ $task->status->color() }}-400"></span>
                            <span class="min-w-0 flex-1 truncate">{{ $task->title }}</span>
                            <span class="hidden w-48 truncate text-sm text-slate-400 sm:block">{{ $task->project?->name }}</span>
                            <span class="hidden w-40 truncate text-sm text-slate-400 md:block">{{ $task->assignee?->name ?? 'Unassigned' }}</span>
                            <span class="w-24 shrink-0 text-right text-sm text-slate-400">{{ $task->due_date?->format('M j') ?? '—' }}</span>
                        </a>
                    @empty
                        <p class="bg-white/[0.02] px-5 py-8 text-center text-slate-400">No open work scheduled.</p>
                    @endforelse
                </div>
            </section>
        </main>
    </div>
</x-layouts.app>
