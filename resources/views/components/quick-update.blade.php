@props(['task', 'compact' => false])
@php
    /** @var \App\Models\Task $task */
    $locked = $task->relationLoaded('subtasks')
        ? $task->subtasks->contains(fn ($s) => $s->status !== \App\Enums\TaskStatus::Cancelled)
        : (isset($task->open_subtasks_count) ? $task->open_subtasks_count > 0 : $task->subtasks()->where('status', '!=', 'cancelled')->exists());
    $uid = 'qu'.$task->id.\Illuminate\Support\Str::random(4);
@endphp
{{--
    Quick status / progress / remark update. Posts to tasks.updates.store which records history.
    Rules mirrored client-side by the `statusProgress` Alpine component (resources/js/components/core.js).
--}}
<form method="POST" action="{{ route('tasks.updates.store', $task) }}"
      x-data="statusProgress(@js($task->status->value), {{ (int) $task->progress }}, @js($locked))"
      {{ $attributes->merge(['class' => $compact ? 'space-y-3' : 'space-y-4']) }}>
    @csrf
    <div class="grid gap-3 {{ $compact ? 'sm:grid-cols-[minmax(0,11rem)_1fr]' : 'sm:grid-cols-2' }}">
        <div>
            <label for="{{ $uid }}-status" class="form-label {{ $compact ? 'text-xs' : '' }}">Status</label>
            <select id="{{ $uid }}-status" name="status" class="form-select" x-model="status" x-on:change="onStatus()">
                @foreach (\App\Enums\TaskStatus::cases() as $s)
                    <option value="{{ $s->value }}">{{ $s->label() }}</option>
                @endforeach
            </select>
        </div>
        <div>
            <label for="{{ $uid }}-progress" class="form-label flex items-center justify-between {{ $compact ? 'text-xs' : '' }}">
                <span>Progress</span>
                <span class="font-semibold text-indigo-600 tabular-nums" x-text="progress + '%'">{{ $task->progress }}%</span>
            </label>
            <template x-if="!locked">
                <div class="flex items-center gap-3 pt-1.5">
                    <input id="{{ $uid }}-progress" type="range" min="0" max="100" step="5" name="progress" class="progress-range w-full" x-model.number="progress" x-on:input="onProgress()">
                    <div class="hidden gap-1 sm:flex">
                        @foreach ([0, 50, 100] as $preset)
                            <button type="button" class="rounded-md border border-slate-200 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50" x-on:click="progress = {{ $preset }}; onProgress()">{{ $preset }}%</button>
                        @endforeach
                    </div>
                </div>
            </template>
            <template x-if="locked">
                <p class="pt-2 text-xs text-slate-500"><x-icon name="subtask" class="inline h-3.5 w-3.5" /> Calculated from subtasks</p>
            </template>
        </div>
    </div>
    <div>
        <label for="{{ $uid }}-remark" class="form-label {{ $compact ? 'text-xs' : '' }}">Remark <span class="font-normal text-slate-400">(optional — use @username to mention)</span></label>
        <textarea id="{{ $uid }}-remark" name="remark" rows="{{ $compact ? 2 : 3 }}" maxlength="2000" class="form-input" placeholder="What changed? Any blockers?"></textarea>
    </div>
    <div class="flex items-center justify-end gap-2">
        {{ $slot }}
        <button type="submit" class="btn-primary {{ $compact ? 'btn-sm' : '' }}">
            <x-icon name="check" class="h-4 w-4" stroke="2" /> Save update
        </button>
    </div>
</form>
