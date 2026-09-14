@props(['label' => null, 'name' => null, 'help' => null, 'required' => false, 'for' => null])
{{-- Wrapper: label + control (slot) + help + validation error for `name` (dot notation supported). --}}
<div {{ $attributes }}>
    @if ($label)
        <label for="{{ $for ?? $name }}" class="form-label">
            {{ $label }} @if ($required)<span class="text-red-500">*</span>@endif
        </label>
    @endif
    {{ $slot }}
    @if ($help)
        <p class="form-help">{{ $help }}</p>
    @endif
    @if ($name)
        @error($name)
            <p class="form-error">{{ $message }}</p>
        @enderror
    @endif
</div>
