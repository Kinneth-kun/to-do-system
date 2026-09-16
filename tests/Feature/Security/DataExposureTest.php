<?php

namespace Tests\Feature\Security;

use App\Models\Notification;
use App\Models\User;
use App\Services\ProjectService;
use App\Services\TaskService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DataExposureTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_user_lookup_does_not_hand_out_email_addresses(): void
    {
        $viewer = $this->regularUser();
        User::factory()->create(['name' => 'Private Person', 'email' => 'private@example.com']);

        $response = $this->actingAs($viewer)->getJson(route('lookup.users', ['q' => 'Private']))->assertOk();

        $response->assertJsonPath('data.0.name', 'Private Person');
        $response->assertJsonMissing(['email' => 'private@example.com']);
        $this->assertStringNotContainsString('private@example.com', $response->getContent());
    }

    public function test_like_wildcards_in_search_are_treated_as_text(): void
    {
        $user = $this->regularUser();
        $project = ProjectService::create(['name' => 'Roof Works'], $user);
        TaskService::create(['project_id' => $project->id, 'title' => 'Paint the lobby'], $user);

        // A bare % must not behave as "match everything".
        $this->actingAs($user)->get(route('search', ['q' => '%']))
            ->assertOk()
            ->assertDontSee('Paint the lobby');

        $this->actingAs($user)->getJson(route('search.suggest', ['q' => '%']))
            ->assertOk()
            ->assertJsonPath('groups', []);
    }

    public function test_search_never_reveals_work_from_other_peoples_projects(): void
    {
        $outsider = $this->regularUser();
        $owner = $this->regularUser();
        $project = ProjectService::create(['name' => 'Confidential Acquisition'], $owner);
        TaskService::create(['project_id' => $project->id, 'title' => 'Draft the offer letter'], $owner);

        $this->actingAs($outsider)->get(route('search', ['q' => 'Confidential']))
            ->assertOk()
            ->assertDontSee('Confidential Acquisition');

        $this->actingAs($outsider)->get(route('search', ['q' => 'offer']))
            ->assertOk()
            ->assertDontSee('Draft the offer letter');

        $this->actingAs($outsider)->getJson(route('search.suggest', ['q' => 'Confidential']))
            ->assertOk()
            ->assertJsonPath('groups', []);
    }

    public function test_opening_a_notification_cannot_be_used_to_redirect_off_site(): void
    {
        $user = $this->regularUser();

        $hostile = Notification::query()->create([
            'user_id' => $user->id,
            'type' => 'task_assigned',
            'title' => 'Look at this',
            'url' => 'https://evil.example.com/phish',
        ]);

        $this->actingAs($user)->get(route('notifications.open', $hostile))
            ->assertRedirect(route('notifications.index'));

        // A normal in-app link still works.
        $normal = Notification::query()->create([
            'user_id' => $user->id,
            'type' => 'task_assigned',
            'title' => 'Real one',
            'url' => '/tasks',
        ]);

        $this->actingAs($user)->get(route('notifications.open', $normal))->assertRedirect('/tasks');
    }

    public function test_notifications_belonging_to_someone_else_are_not_reachable(): void
    {
        $user = $this->regularUser();
        $other = $this->regularUser();

        $theirs = Notification::query()->create([
            'user_id' => $other->id,
            'type' => 'task_assigned',
            'title' => 'Not yours',
            'url' => '/tasks',
        ]);

        $this->actingAs($user)->get(route('notifications.open', $theirs))->assertNotFound();
        $this->actingAs($user)->post(route('notifications.read', $theirs))->assertNotFound();
    }

    public function test_uploaded_files_record_the_server_detected_type(): void
    {
        $this->assertStringContainsString(
            '$file->getMimeType()',
            file_get_contents(base_path('app/Http/Controllers/AttachmentController.php')),
            'the stored MIME type must not come from the browser'
        );
    }
}
