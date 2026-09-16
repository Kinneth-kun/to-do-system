<?php

namespace Tests\Feature\Automation;

use App\Enums\NotificationType;
use App\Models\Notification;
use App\Models\User;
use App\Services\AI\BriefingService;
use App\Services\ProjectService;
use App\Services\Settings;
use App\Services\TaskService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Console\Scheduling\Schedule;
use Mockery;
use Tests\TestCase;

class DailyDigestTest extends TestCase
{
    use RefreshDatabase;

    private function userWithWork(array $attributes = []): User
    {
        $user = $this->regularUser($attributes);
        $project = ProjectService::create(['name' => 'Fit-out'], $user);

        // One overdue, one due today, one due later.
        $late = TaskService::create(['project_id' => $project->id, 'title' => 'Chase the contractor', 'assignee_id' => $user->id], $user);
        $late->forceFill(['due_date' => today()->subDays(3)->toDateString()])->save();

        TaskService::create(['project_id' => $project->id, 'title' => 'Inspect unit 402', 'assignee_id' => $user->id, 'due_date' => today()->toDateString()], $user);
        TaskService::create(['project_id' => $project->id, 'title' => 'File the permit', 'assignee_id' => $user->id, 'due_date' => today()->addDays(2)->toDateString()], $user);

        return $user;
    }

    public function test_it_is_scheduled_for_8am_on_weekdays(): void
    {
        $events = collect(app(Schedule::class)->events())
            ->filter(fn ($event) => str_contains($event->command ?? '', 'taskflow:daily-digest'));

        $this->assertCount(1, $events, 'the digest should be scheduled exactly once');
        $this->assertSame('0 8 * * 1-5', $events->first()->expression, '08:00, Monday to Friday');
    }

    public function test_it_sends_one_notification_per_person_with_work(): void
    {
        $user = $this->userWithWork(['name' => 'Kinneth Daluag']);
        $idle = $this->regularUser(['name' => 'No Work Nina']);

        $this->artisan('taskflow:daily-digest')->assertSuccessful();

        $digest = Notification::query()->where('type', NotificationType::DailyDigest->value)->get();
        $this->assertCount(1, $digest, 'only the person with open work is briefed');
        $this->assertSame($user->id, $digest->first()->user_id);
        $this->assertStringContainsString('overdue', $digest->first()->title);
        $this->assertNotEmpty($digest->first()->message);
        $this->assertSame(route('dashboard'), $digest->first()->url);
        $this->assertSame(1, $digest->first()->data['overdue']);
        $this->assertSame(1, $digest->first()->data['due_today']);

        $this->assertDatabaseMissing('notifications', [
            'user_id' => $idle->id,
            'type' => NotificationType::DailyDigest->value,
        ]);
    }

    public function test_it_does_not_brief_the_same_person_twice_in_a_day(): void
    {
        $this->userWithWork();

        $this->artisan('taskflow:daily-digest')->assertSuccessful();
        $this->artisan('taskflow:daily-digest')->assertSuccessful();

        $this->assertSame(1, Notification::query()->where('type', NotificationType::DailyDigest->value)->count());

        // ...unless told to.
        $this->artisan('taskflow:daily-digest --force')->assertSuccessful();
        $this->assertSame(2, Notification::query()->where('type', NotificationType::DailyDigest->value)->count());
    }

    public function test_deactivated_people_are_not_briefed(): void
    {
        $user = $this->userWithWork();
        $user->forceFill(['is_active' => false])->save();

        $this->artisan('taskflow:daily-digest')->assertSuccessful();

        $this->assertSame(0, Notification::query()->where('type', NotificationType::DailyDigest->value)->count());
    }

    public function test_dry_run_writes_nothing(): void
    {
        $this->userWithWork();

        $this->artisan('taskflow:daily-digest --dry-run')->assertSuccessful();

        $this->assertSame(0, Notification::query()->where('type', NotificationType::DailyDigest->value)->count());
    }

    public function test_the_digest_still_goes_out_when_ai_is_unavailable(): void
    {
        config(['services.anthropic.key' => null]);   // no API key configured
        $this->userWithWork();

        $this->artisan('taskflow:daily-digest')->assertSuccessful();

        $digest = Notification::query()->where('type', NotificationType::DailyDigest->value)->sole();
        $this->assertStringContainsString('past their due date', $digest->message, 'falls back to a plain summary');
        $this->assertStringContainsString('Chase the contractor', $digest->message);
        $this->assertFalse($digest->data['ai']);
    }

    public function test_an_ai_failure_does_not_stop_the_digest(): void
    {
        config(['services.anthropic.key' => 'sk-ant-test']);
        $this->userWithWork();

        $this->mock(BriefingService::class, function ($mock) {
            $mock->shouldReceive('enabled')->andReturn(true);
            $mock->shouldReceive('configured')->andReturn(true);
            $mock->shouldReceive('summarise')->andReturn(null);   // API down / refused / timed out
        });

        $this->artisan('taskflow:daily-digest')->assertSuccessful();

        $digest = Notification::query()->where('type', NotificationType::DailyDigest->value)->sole();
        $this->assertNotEmpty($digest->message);
    }

    public function test_ai_summary_is_used_when_available(): void
    {
        config(['services.anthropic.key' => 'sk-ant-test']);
        $this->userWithWork();

        $this->mock(BriefingService::class, function ($mock) {
            $mock->shouldReceive('enabled')->andReturn(true);
            $mock->shouldReceive('configured')->andReturn(true);
            $mock->shouldReceive('summarise')->once()->andReturn('Two things need you today.');
        });

        $this->artisan('taskflow:daily-digest')->assertSuccessful();

        $this->assertSame(
            'Two things need you today.',
            Notification::query()->where('type', NotificationType::DailyDigest->value)->sole()->message
        );
    }

    public function test_it_can_be_switched_off_in_settings(): void
    {
        $this->userWithWork();
        Settings::set(['digest.enabled' => false]);

        $this->artisan('taskflow:daily-digest')->assertSuccessful();

        $this->assertSame(0, Notification::query()->where('type', NotificationType::DailyDigest->value)->count());
    }

    public function test_quiet_days_can_be_included(): void
    {
        $this->regularUser(['name' => 'Idle Ian']);
        Settings::set(['digest.include_quiet_days' => true]);

        $this->artisan('taskflow:daily-digest')->assertSuccessful();

        $digest = Notification::query()->where('type', NotificationType::DailyDigest->value)->sole();
        $this->assertStringContainsString('Nothing is overdue', $digest->message);
    }

    public function test_the_briefing_reaches_the_live_notification_endpoint(): void
    {
        $user = $this->userWithWork();
        $this->artisan('taskflow:daily-digest')->assertSuccessful();

        // The newest notification is the briefing. (The auto-delay notice for the overdue
        // task is legitimately unread too, so don't assert an exact unread count.)
        $response = $this->actingAs($user)->getJson(route('notifications.recent'))->assertOk();

        $this->assertSame('daily_digest', $response->json('data.0.type'));
        $this->assertGreaterThanOrEqual(1, $response->json('unread_count'));
    }

    protected function tearDown(): void
    {
        Mockery::close();
        parent::tearDown();
    }
}
