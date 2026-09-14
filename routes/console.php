<?php

use App\Services\DeadlineService;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('taskflow:check-deadlines', function () {
    $result = DeadlineService::run();
    $this->info("Marked {$result['delayed']} task(s) delayed, sent {$result['reminders']} deadline reminder(s), refreshed {$result['projects']} project(s).");
})->purpose('Mark overdue tasks as Delayed, send due-soon reminders and refresh project health');

Schedule::command('taskflow:check-deadlines')->hourly()->withoutOverlapping();
