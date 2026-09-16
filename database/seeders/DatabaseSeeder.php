<?php

namespace Database\Seeders;

use App\Enums\Department;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;

/**
 * Production-safe seed: the two roles and one administrator account. No sample content.
 *
 * The administrator is defined by environment variables so no credential is ever committed:
 *
 *   ADMIN_NAME, ADMIN_EMAIL, ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_DEPARTMENT, ADMIN_JOB_TITLE
 *
 * Re-running updates the existing account instead of creating a duplicate. The password is
 * only written when ADMIN_PASSWORD is set, so a later `db:seed` will not silently reset a
 * password that was changed inside the app.
 *
 * Demo content now lives in DemoDataSeeder and must be asked for explicitly:
 *   php artisan db:seed --class=DemoDataSeeder
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        Role::idFor(Role::ADMIN);
        Role::idFor(Role::USER);

        $email = env('ADMIN_EMAIL');

        if (blank($email)) {
            $this->command?->warn('ADMIN_EMAIL is not set — skipping administrator creation.');

            return;
        }

        $user = User::query()->firstOrNew(['email' => $email]);
        $isNew = ! $user->exists;

        $user->fill([
            'role_id' => Role::idFor(Role::ADMIN),
            'name' => env('ADMIN_NAME', 'Administrator'),
            'department' => Department::tryFrom((string) env('ADMIN_DEPARTMENT')) ?? Department::Operations,
            'job_title' => env('ADMIN_JOB_TITLE', 'System Administrator'),
            'is_active' => true,
        ]);

        // Only set the username on creation — don't fight the unique index on re-seed.
        if ($isNew && filled($username = env('ADMIN_USERNAME'))) {
            $user->username = $username;
        }

        $user->email_verified_at ??= now();

        if (filled($password = env('ADMIN_PASSWORD'))) {
            $user->password = $password; // hashed by the model cast
        } elseif ($isNew) {
            $this->command?->warn('ADMIN_PASSWORD is not set — the account will have no usable password.');
        }

        $user->save();

        $this->command?->info(($isNew ? 'Created' : 'Updated').' administrator '.$user->email.' (username: '.$user->username.')');
    }
}
