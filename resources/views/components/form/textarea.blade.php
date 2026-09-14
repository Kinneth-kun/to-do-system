@props(['name', 'label' => null, 'value' => null, 'rows' => 3, 'help' => null, 'required' => false])
<x-form.field :label="$label" :name="$name" :help="$help" :required="$required">
    <textarea name="{{ $name }}" id="{{ $attributes->get('id', $name) }}" rows="{{ $rows }}" @required($required)
        {{ $attributes->except('id')->merge(['class' => 'form-input'.($errors->has($name) ? ' border-red-400' : '')]) }}>{{ old($name, $value) }}</textarea>
</x-form.field>
