@props(['name', 'label' => null, 'type' => 'text', 'value' => null, 'help' => null, 'required' => false])
<x-form.field :label="$label" :name="$name" :help="$help" :required="$required">
    <input
        type="{{ $type }}"
        name="{{ $name }}"
        id="{{ $attributes->get('id', $name) }}"
        @if ($type !== 'password') value="{{ old($name, $value) }}" @endif
        @required($required)
        {{ $attributes->except('id')->merge(['class' => 'form-input'.($errors->has($name) ? ' border-red-400 focus:border-red-500 focus:ring-red-500/20' : '')]) }}
    >
</x-form.field>
