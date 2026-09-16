<?php

namespace Tests\Feature\Ui;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Modals must render outside <header>.
 *
 * The top bar uses backdrop-blur, and backdrop-filter makes an element the containing block for
 * position:fixed descendants — so a modal rendered inside it is trapped in the 64px top bar
 * instead of covering the viewport.
 */
class ModalPlacementTest extends TestCase
{
    use RefreshDatabase;

    private function headerMarkup(string $html): string
    {
        $start = strpos($html, '<header');
        $end = strpos($html, '</header>');

        $this->assertNotFalse($start, 'the layout should render a <header>');
        $this->assertNotFalse($end, 'the layout should close its <header>');

        return substr($html, $start, $end - $start);
    }

    public function test_modals_are_not_rendered_inside_the_blurred_header(): void
    {
        $html = $this->actingAs($this->regularUser())->get(route('tasks.create'))->assertOk()->getContent();

        $this->assertStringContainsString('x-data="modal(', $html, 'the page should render the shared modals');
        $this->assertStringNotContainsString('x-data="modal(', $this->headerMarkup($html),
            'modals inside the backdrop-blurred header are clipped to the top bar');
    }

    public function test_the_header_still_renders_the_quick_create_trigger(): void
    {
        $html = $this->actingAs($this->regularUser())->get(route('tasks.index'))->assertOk()->getContent();

        $this->assertStringContainsString("open-modal', 'quick-create", $this->headerMarkup($html),
            'the trigger button belongs in the header even though the modal does not');
    }

    public function test_both_shared_modals_render_once_per_page(): void
    {
        $html = $this->actingAs($this->regularUser())->get(route('tasks.create'))->assertOk()->getContent();

        $this->assertSame(1, substr_count($html, "modal('quick-create'"), 'quick create modal should render exactly once');
        $this->assertSame(1, substr_count($html, "modal('new-project'"), 'new project modal should render exactly once');
    }

    public function test_modal_markup_carries_dialog_semantics(): void
    {
        $html = $this->actingAs($this->regularUser())->get(route('tasks.create'))->assertOk()->getContent();

        $this->assertStringContainsString('role="dialog"', $html);
        $this->assertStringContainsString('aria-modal="true"', $html);
    }

    public function test_destructive_actions_use_the_in_app_dialog_not_the_browser_confirm(): void
    {
        $user = $this->regularUser();
        $project = \App\Services\ProjectService::create(['name' => 'Confirm Me'], $user);
        $task = \App\Services\TaskService::create(['project_id' => $project->id, 'title' => 'Confirm task'], $user);

        $pages = [
            route('projects.show', $project),
            route('tasks.show', $task),
        ];

        foreach ($pages as $page) {
            $html = $this->actingAs($user)->get($page)->assertOk()->getContent();

            $this->assertStringNotContainsString('return confirm(', $html,
                "native confirm() shows the raw origin and cannot be styled: {$page}");
            $this->assertStringContainsString('confirmable(', $html,
                "destructive forms should ask through the shared dialog: {$page}");
        }
    }

    public function test_admin_user_actions_use_the_in_app_dialog(): void
    {
        $admin = $this->admin();
        $this->regularUser(['name' => 'Someone Else']);

        $html = $this->actingAs($admin)->get(route('admin.users.index'))->assertOk()->getContent();

        $this->assertStringNotContainsString('return confirm(', $html);
        $this->assertStringContainsString('Deactivate Someone Else', $html);
    }

    public function test_the_confirmation_dialog_renders_once(): void
    {
        $html = $this->actingAs($this->regularUser())->get(route('tasks.index'))->assertOk()->getContent();

        $this->assertSame(1, substr_count($html, 'x-data="confirmDialog"'));
        $this->assertSame(1, substr_count($html, "modal('confirm'"));
    }
}
