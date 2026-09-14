@props(['name', 'label' => null, 'options' => [], 'value' => null, 'placeholder' => null, 'help' => null, 'required' => false])
@php
    $current = old($name, $value instanceof \BackedEnum ? $value->value : $value);
@endphp
<x-form.field :label="$label" :name="$name" :help="$help" :required="$required">
    <select name="{{ $name }}" id="{{ $attributes->get('id', $name) }}" @required($required)
        {{ $attributes->except('id')->merge(['class' => 'form-select'.($errors->has($name) ? ' border-red-400' : '')]) }}>
        @if ($placeholder !== null)
            <option value="">{{ $placeholder }}</option>
        @endif
        @foreach ($options as $optValue => $optLabel)
            <option value="{{ $optValue }}" @selected((string) $current === (string) $optValue)>{{ $optLabel }}</option>
        @endforeach
    </select>
</x-form.field>
