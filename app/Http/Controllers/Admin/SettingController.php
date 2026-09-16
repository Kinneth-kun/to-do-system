<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Services\ActivityLogger;
use App\Services\ProjectHealthService;
use App\Services\Settings;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class SettingController extends Controller
{
    public function edit()
    {
        return view('admin.settings.edit', ['groups' => Settings::grouped()]);
    }

    public function update(Request $request)
    {
        $rules = [];
        foreach (Settings::DEFINITIONS as $key => $definition) {
            $rules[$key] = match ($definition['type']) {
                'bool' => ['sometimes', 'boolean'],
                'int' => ['required', 'integer', Rule::when(isset($definition['min']), 'min:'.$definition['min']), Rule::when(isset($definition['max']), 'max:'.$definition['max'])],
                default => ['required', 'string', 'max:255'],
            };
        }

        $values = $request->validate($rules);
        foreach (Settings::DEFINITIONS as $key => $definition) {
            if ($definition['type'] === 'bool') {
                $values[$key] = $request->boolean($key);
            }
        }

        Settings::set($values);
        ProjectHealthService::refreshAll();
        ActivityLogger::log('settings.updated', 'Updated application settings', null, ['keys' => array_keys($values)]);

        return back()->with('success', 'Settings updated.');
    }
}
