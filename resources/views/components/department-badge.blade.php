@props(['department', 'size' => 'md', 'short' => false])
@php
    $department = $department instanceof \App\Enums\Department
        ? $department
        : \App\Enums\Department::tryFrom((string) $department);
    $c = $department?->color() ?? 'slate';
    $sizes = ['sm' => 'px-1.5 py-0.5 text-[11px]', 'md' => 'px-2 py-0.5 text-xs', 'lg' => 'px-2.5 py-1 text-sm'];
@endphp
@if ($department)
    <span {{ $attributes->merge(['class' => "inline-flex items-center gap-1 rounded-md font-medium whitespace-nowrap bg-{$c}-50 text-{$c}-700 ring-1 ring-inset ring-{$c}-100 ".($sizes[$size] ?? $sizes['md'])]) }}
          title="{{ $department->label() }}">
        <x-icon :name="$department->icon()" class="h-3 w-3" />
        {{ $short ? $department->code() : $department->label() }}
    </span>
@endif
