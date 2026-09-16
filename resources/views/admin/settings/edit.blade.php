<x-layouts.app title="Settings">
    <x-page-header title="Settings" description="Tune deadlines, project health, and security behavior." />
    <form method="POST" action="{{ route('admin.settings.update') }}" class="space-y-6">@csrf @method('PUT')
        @foreach($groups as $group => $settings)
            <section class="card"><div class="card-header"><h2 class="card-title">{{ $group }}</h2></div><div class="grid gap-5 p-5 sm:grid-cols-2">
                @foreach($settings as $key => $setting)<div><label for="{{ $key }}" class="form-label">{{ $setting['label'] }}</label>@if($setting['type'] === 'bool')<label class="flex items-center gap-2"><input id="{{ $key }}" name="{{ $key }}" type="checkbox" value="1" class="form-checkbox" @checked($setting['value'])><span class="text-sm text-slate-700">Enabled</span></label>@elseif($setting['type'] === 'int')<input id="{{ $key }}" name="{{ $key }}" type="number" value="{{ old($key, $setting['value']) }}" min="{{ $setting['min'] ?? '' }}" max="{{ $setting['max'] ?? '' }}" class="form-input">@else<input id="{{ $key }}" name="{{ $key }}" type="text" value="{{ old($key, $setting['value']) }}" class="form-input">@endif<p class="form-help">{{ $setting['help'] }}</p>@error($key)<p class="form-error">{{ $message }}</p>@enderror</div>@endforeach
            </div></section>
        @endforeach
        <div class="flex justify-end"><button class="btn-primary" type="submit">Save settings</button></div>
    </form>
</x-layouts.app>
