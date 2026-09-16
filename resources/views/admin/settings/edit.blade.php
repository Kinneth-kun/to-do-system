@php
    $groupIcons = ['General' => 'cog', 'Deadlines' => 'clock', 'Project health' => 'chart', 'Security' => 'lock'];
@endphp
<x-layouts.app title="Settings">
    <x-page-header title="Settings" description="Tune deadlines, project health and security behaviour for everyone." />

    <form method="POST" action="{{ route('admin.settings.update') }}" class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        @csrf @method('PUT')

        <div class="space-y-6">
            @foreach ($groups as $group => $settings)
                <section class="card">
                    <div class="card-header">
                        <h2 class="card-title flex items-center gap-2">
                            <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                                <x-icon :name="$groupIcons[$group] ?? 'cog'" class="h-4 w-4" />
                            </span>
                            {{ $group }}
                        </h2>
                    </div>
                    <div class="divide-y divide-slate-100">
                        @foreach ($settings as $key => $setting)
                            <div class="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
                                <div class="min-w-0 sm:max-w-md">
                                    <label for="{{ $key }}" class="text-sm font-medium text-slate-800">{{ $setting['label'] }}</label>
                                    <p class="mt-0.5 text-xs leading-relaxed text-slate-500">{{ $setting['help'] }}</p>
                                    @error($key)<p class="form-error">{{ $message }}</p>@enderror
                                </div>

                                <div class="shrink-0 sm:w-56 sm:text-right">
                                    @if ($setting['type'] === 'bool')
                                        <label class="inline-flex cursor-pointer items-center gap-2.5">
                                            <input type="hidden" name="{{ $key }}" value="0">
                                            <input id="{{ $key }}" name="{{ $key }}" type="checkbox" value="1" class="peer sr-only" @checked(old($key, $setting['value']))>
                                            <span class="relative h-6 w-11 rounded-full bg-slate-200 transition peer-checked:bg-indigo-600 peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500 peer-focus-visible:ring-offset-2">
                                                <span class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5"></span>
                                            </span>
                                            <span class="text-sm text-slate-600 peer-checked:text-indigo-700">Enabled</span>
                                        </label>
                                    @elseif ($setting['type'] === 'int')
                                        <div class="flex items-center gap-2 sm:justify-end">
                                            <input id="{{ $key }}" name="{{ $key }}" type="number" value="{{ old($key, $setting['value']) }}"
                                                   min="{{ $setting['min'] ?? '' }}" max="{{ $setting['max'] ?? '' }}" class="form-input w-24 text-right tabular-nums">
                                            @if (isset($setting['min'], $setting['max']))
                                                <span class="text-xs whitespace-nowrap text-slate-400">{{ $setting['min'] }}–{{ $setting['max'] }}</span>
                                            @endif
                                        </div>
                                    @else
                                        <input id="{{ $key }}" name="{{ $key }}" type="text" value="{{ old($key, $setting['value']) }}" class="form-input">
                                    @endif
                                </div>
                            </div>
                        @endforeach
                    </div>
                </section>
            @endforeach

            <div class="flex items-center justify-end gap-3">
                <p class="mr-auto text-xs text-slate-500">Changes apply immediately and project health is recalculated.</p>
                <button class="btn-primary" type="submit"><x-icon name="check" class="h-4 w-4" stroke="2" /> Save settings</button>
            </div>
        </div>

        {{-- How health is decided --}}
        <aside class="card lg:sticky lg:top-24">
            <div class="card-header"><h2 class="card-title">How project health works</h2></div>
            <div class="card-body">
                <p class="text-xs leading-relaxed text-slate-500">Each project is checked against these rules in order — the first one that matches wins.</p>
                <ol class="mt-4 space-y-3">
                    @foreach ([
                        ['Completed', 'emerald', 'The project is marked completed, or every task is done.'],
                        ['On Hold', 'slate', 'The project status is On Hold or Cancelled.'],
                        ['Delayed', 'red', 'The project is past its due date, or too many open tasks are delayed.'],
                        ['At Risk', 'amber', 'Some tasks are delayed, progress is behind schedule, or the deadline is close with low progress.'],
                        ['On Track', 'emerald', 'Nothing above applies.'],
                    ] as [$label, $color, $description])
                        <li class="flex gap-2.5">
                            <span class="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-{{ $color }}-500"></span>
                            <div>
                                <p class="text-sm font-medium text-slate-800">{{ $label }}</p>
                                <p class="text-xs leading-relaxed text-slate-500">{{ $description }}</p>
                            </div>
                        </li>
                    @endforeach
                </ol>
            </div>
        </aside>
    </form>
</x-layouts.app>
