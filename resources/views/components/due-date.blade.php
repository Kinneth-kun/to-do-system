@props(['task', 'format' => 'M j'])
@php
    /** @var \App\Models\Task $task */
    $state = match (true) {
        $task->due_date === null => 'none',
        ! $task->status->isOpen() => 'closed',
        $task->isOverdue() || $task->status === \App\Enums\TaskStatus::Delayed => 'overdue',
        $task->isDueSoon() => 'soon',
        default => 'normal',
    };
    $classes = [
        'overdue' => 'text-red-600 font-semibold',
        'soon' => 'text-amber-600 font-semibold',
        'normal' => 'text-slate-600',
        'closed' => 'text-slate-400',
        'none' => 'text-slate-400',
    ][$state];
@endphp
<span {{ $attributes->merge(['class' => "inline-flex items-center gap-1 text-xs whitespace-nowrap {$classes}"]) }} @if ($task->due_date) title="{{ $task->dueLabel() }} · {{ $task->due_date->format('D, M j, Y') }}" @endif>
    <x-icon name="{{ $state === 'overdue' ? 'alert' : 'calendar' }}" class="h-3.5 w-3.5" />
    {{ $task->due_date ? $task->due_date->format($format) : 'No due date' }}
</span>
