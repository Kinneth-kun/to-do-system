<?php

use App\Services\DeadlineService;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('taskflow:check-deadlines', function () {
    $result = DeadlineService::run();
    $this->info("Marked {$result['delayed']} task(s) delayed, sent {$result['reminders']} deadline reminder(s), refreshed {$result['projects']} project(s).");
})->purpose('Mark overdue tasks as Delayed, send due-soon reminders and refresh project health');

Schedule::command('taskflow:check-deadlines')->hourly()->withoutOverlapping();

/*
 * The morning briefing: 08:00, Monday to Friday, in the application's timezone
 * (APP_TIMEZONE — set this to your local zone or 8am will fire at the wrong hour).
 *
 * Requires the scheduler to be running. Either:
 *   php artisan schedule:work                       (foreground, good for a dev machine)
 *   schtasks ... php artisan schedule:run            (Windows Task Scheduler, every minute)
 * See docs/AUTOMATION.md.
 */
Schedule::command('taskflow:daily-digest')
    ->weekdays()
    ->at('08:00')
    ->timezone(config('app.timezone'))
    ->withoutOverlapping()
    ->onFailure(fn () => logger()->error('Daily digest failed to run.'));
