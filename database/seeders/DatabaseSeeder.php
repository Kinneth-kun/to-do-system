<?php

namespace Database\Seeders;

use App\Enums\Department;
use App\Enums\ProjectMemberRole;
use App\Enums\ProjectStatus;
use App\Models\Role;
use App\Models\Task;
use App\Models\TaskComment;
use App\Models\User;
use App\Services\ActivityLogger;
use App\Services\DeadlineService;
use App\Services\NotificationService;
use App\Services\ProjectService;
use App\Services\TaskService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed roles, an administrator, demo users and realistic demo projects.
     *
     *   Admin:  admin@taskflow.test / password
     *   Users:  maria@taskflow.test, james@taskflow.test, … / password
     */
    public function run(): void
    {
        Role::idFor(Role::ADMIN);
        Role::idFor(Role::USER);

        $admin = User::query()->create([
            'role_id' => Role::idFor(Role::ADMIN),
            'name' => 'Alex Administrator',
            'username' => 'admin',
            'email' => 'admin@taskflow.test',
            'job_title' => 'Operations Director',
            'department' => Department::Operations,
            'avatar_color' => 'indigo',
            'password' => 'password',
            'email_verified_at' => now(),
        ]);

        if (! app()->environment('production')) {
            $this->seedDemoData($admin);
        }
    }

    private function seedDemoData(User $admin): void
    {
        $people = collect([
            ['Maria Santos', 'maria', 'Project Manager', Department::Operations, 'violet'],
            ['James Carter', 'james', 'Software Engineer', Department::InformationTechnology, 'sky'],
            ['Aisha Rahman', 'aisha', 'UX Designer', Department::Marketing, 'rose'],
            ['Daniel Kim', 'daniel', 'Financial Analyst', Department::Accounting, 'emerald'],
            ['Sofia Reyes', 'sofia', 'Leasing Officer', Department::Leasing, 'amber'],
            ['Liam O\'Brien', 'liam', 'Security Supervisor', Department::Security, 'teal'],
            ['Grace Lee', 'grace', 'HR Coordinator', Department::HumanResources, 'fuchsia'],
        ])->mapWithKeys(fn ($p) => [$p[1] => User::query()->create([
            'name' => $p[0], 'username' => $p[1], 'email' => $p[1].'@taskflow.test',
            'job_title' => $p[2], 'department' => $p[3], 'avatar_color' => $p[4],
            'password' => 'password', 'email_verified_at' => now(),
        ])]);

        $maria = $people['maria'];
        $james = $people['james'];
        $aisha = $people['aisha'];
        $daniel = $people['daniel'];
        $sofia = $people['sofia'];
        $liam = $people['liam'];
        $grace = $people['grace'];

        $d = fn (int $days) => today()->addDays($days)->toDateString();

        /* ------------------------------------------------------------------ 1. Customer Portal (at risk) */
        $this->at(-40, function () use ($maria, $james, $aisha, $liam, $d) {
            $p = ProjectService::create([
                'name' => 'Customer Portal Launch', 'description' => 'Self-service portal where customers can track orders, download invoices and raise support tickets.',
                'owner_id' => $maria->id, 'priority' => 'high', 'color' => 'indigo',
                'start_date' => $d(0), 'due_date' => $d(60), 'member_ids' => [$james->id, $aisha->id, $liam->id],
            ], $maria);

            $design = TaskService::create(['project_id' => $p->id, 'title' => 'UX research & wireframes', 'assignee_id' => $aisha->id, 'priority' => 'high', 'start_date' => $d(0), 'due_date' => $d(14)], $maria);
            $build = TaskService::create(['project_id' => $p->id, 'title' => 'Build portal front-end', 'assignee_id' => $james->id, 'priority' => 'high', 'start_date' => $d(10), 'due_date' => $d(45), 'collaborator_ids' => [$aisha->id]], $maria);
            $api = TaskService::create(['project_id' => $p->id, 'title' => 'Order tracking API integration', 'assignee_id' => $james->id, 'priority' => 'urgent', 'start_date' => $d(5), 'due_date' => $d(35)], $maria);
            $qa = TaskService::create(['project_id' => $p->id, 'title' => 'End-to-end QA test plan', 'assignee_id' => $liam->id, 'priority' => 'medium', 'start_date' => $d(30), 'due_date' => $d(55)], $maria);

            return compact('p', 'design', 'build', 'api', 'qa');
        }, function (array $x) use ($maria, $james, $aisha, $liam, $d) {
            $this->at(-36, fn () => TaskService::create(['parent_id' => $x['design']->id, 'title' => 'Interview 8 customers', 'assignee_id' => $aisha->id, 'due_date' => $d(5)], $aisha));
            $this->at(-36, fn () => TaskService::create(['parent_id' => $x['design']->id, 'title' => 'Low-fidelity wireframes', 'assignee_id' => $aisha->id, 'due_date' => $d(9)], $aisha));
            $this->at(-36, fn () => TaskService::create(['parent_id' => $x['design']->id, 'title' => 'Stakeholder review', 'assignee_id' => $maria->id, 'due_date' => $d(12)], $aisha));

            $x['design']->subtasks()->get()->each(function (Task $s, $i) use ($aisha, $maria) {
                $this->at(-34 + $i * 3, fn () => TaskService::applyUpdate($s, $s->assignee_id === $maria->id ? $maria : $aisha, null, 50, 'Halfway there.'));
                $this->at(-30 + $i * 3, fn () => TaskService::applyUpdate($s, $s->assignee_id === $maria->id ? $maria : $aisha, 'completed', null, 'Done and shared in the project folder.'));
            });

            $this->at(-28, fn () => TaskService::applyUpdate($x['api'], $james, null, 20, 'Auth handshake with the order service is working.'));
            $this->at(-18, fn () => TaskService::applyUpdate($x['api'], $james, null, 45, 'Blocked on staging credentials from the vendor. @maria can you chase?'));
            $this->at(-17, fn () => $this->comment($x['api'], $maria, 'Escalated to the vendor account manager — expecting credentials by Friday.'));
            $this->at(-20, fn () => TaskService::applyUpdate($x['build'], $james, null, 15, 'Component library set up.'));
            $this->at(-6, fn () => TaskService::applyUpdate($x['build'], $james, null, 35, 'Dashboard and order list pages done.'));
            $this->at(-5, fn () => $this->comment($x['build'], $aisha, '@james the order list looks great. Small note: the status chips need more contrast.'));

            // API task fell behind: its due date passes and it becomes Delayed.
            $x['api']->forceFill(['due_date' => today()->subDays(3)->toDateString()])->save();
        });

        /* ------------------------------------------------------------------ 2. Office Relocation (on track) */
        $this->at(-20, function () use ($grace, $daniel, $sofia, $d) {
            $p = ProjectService::create([
                'name' => 'Head Office Relocation', 'description' => 'Move 60 staff to the new Riverside office with zero downtime.',
                'owner_id' => $grace->id, 'priority' => 'medium', 'color' => 'emerald',
                'start_date' => $d(0), 'due_date' => $d(50), 'member_ids' => [$daniel->id, $sofia->id],
            ], $grace);
            $lease = TaskService::create(['project_id' => $p->id, 'title' => 'Sign lease & floor plan', 'assignee_id' => $grace->id, 'priority' => 'high', 'start_date' => $d(0), 'due_date' => $d(10)], $grace);
            $it = TaskService::create(['project_id' => $p->id, 'title' => 'IT network & desk setup', 'assignee_id' => $daniel->id, 'priority' => 'high', 'start_date' => $d(12), 'due_date' => $d(40)], $grace);
            $comms = TaskService::create(['project_id' => $p->id, 'title' => 'Staff move communications', 'assignee_id' => $sofia->id, 'start_date' => $d(15), 'due_date' => $d(22)], $grace);

            return compact('p', 'lease', 'it', 'comms');
        }, function (array $x) use ($grace, $daniel, $sofia) {
            $this->at(-15, fn () => TaskService::applyUpdate($x['lease'], $grace, null, 60, 'Lease terms agreed, legal reviewing.'));
            $this->at(-11, fn () => TaskService::applyUpdate($x['lease'], $grace, 'completed', null, 'Lease signed. Floor plan approved by leadership.'));
            $this->at(-4, fn () => TaskService::applyUpdate($x['it'], $daniel, null, 40, 'Cabling complete on level 2.'));
            $this->at(-2, fn () => TaskService::applyUpdate($x['comms'], $sofia, null, 70, 'FAQ and move-day schedule drafted.'));
            $this->at(-1, fn () => TaskService::addCollaborator($x['comms'], $grace, $grace));
        });

        /* ------------------------------------------------------------------ 3. Q3 Marketing Campaign (delayed, overdue project) */
        $this->at(-75, function () use ($sofia, $aisha, $daniel, $d) {
            $p = ProjectService::create([
                'name' => 'Q3 Brand Campaign', 'description' => 'Multi-channel campaign for the autumn product line.',
                'owner_id' => $sofia->id, 'priority' => 'high', 'color' => 'rose',
                'start_date' => $d(0), 'due_date' => $d(70), 'member_ids' => [$aisha->id, $daniel->id],
            ], $sofia);
            $creative = TaskService::create(['project_id' => $p->id, 'title' => 'Campaign creative assets', 'assignee_id' => $aisha->id, 'priority' => 'high', 'start_date' => $d(0), 'due_date' => $d(40)], $sofia);
            $media = TaskService::create(['project_id' => $p->id, 'title' => 'Media buying plan', 'assignee_id' => $sofia->id, 'priority' => 'medium', 'start_date' => $d(20), 'due_date' => $d(55)], $sofia);
            $report = TaskService::create(['project_id' => $p->id, 'title' => 'Campaign performance dashboard', 'assignee_id' => $daniel->id, 'priority' => 'low', 'start_date' => $d(40), 'due_date' => $d(68)], $sofia);

            return compact('p', 'creative', 'media', 'report');
        }, function (array $x) use ($sofia, $aisha, $daniel) {
            $this->at(-60, fn () => TaskService::applyUpdate($x['creative'], $aisha, null, 30, 'Moodboards approved.'));
            $this->at(-40, fn () => TaskService::applyUpdate($x['creative'], $aisha, null, 100, 'All assets delivered.'));
            $this->at(-30, fn () => TaskService::applyUpdate($x['media'], $sofia, null, 60, 'Negotiating rates with two publishers.'));
            $this->at(-12, fn () => TaskService::applyUpdate($x['report'], $daniel, null, 25, 'Waiting on ad platform data export.'));
            $this->at(-8, fn () => TaskService::applyUpdate($x['media'], $sofia, 'on_hold', null, 'Budget approval pending from finance.'));
        });

        /* ------------------------------------------------------------------ 4. Onboarding revamp (completed) */
        $this->at(-90, function () use ($grace, $maria, $d) {
            $p = ProjectService::create([
                'name' => 'Employee Onboarding Revamp', 'description' => 'New-hire checklist, buddy program and first-week schedule.',
                'owner_id' => $grace->id, 'priority' => 'low', 'color' => 'fuchsia',
                'start_date' => $d(0), 'due_date' => $d(45), 'member_ids' => [$maria->id],
            ], $grace);
            $t1 = TaskService::create(['project_id' => $p->id, 'title' => 'New-hire checklist', 'assignee_id' => $grace->id, 'due_date' => $d(20)], $grace);
            $t2 = TaskService::create(['project_id' => $p->id, 'title' => 'Buddy program guidelines', 'assignee_id' => $maria->id, 'due_date' => $d(35)], $grace);

            return compact('p', 't1', 't2');
        }, function (array $x) use ($grace, $maria) {
            $this->at(-70, fn () => TaskService::applyUpdate($x['t1'], $grace, 'completed', null, 'Checklist live in the HR portal.'));
            $this->at(-55, fn () => TaskService::applyUpdate($x['t2'], $maria, 'completed', null, 'Guidelines published.'));
            $this->at(-50, fn () => ProjectService::update($x['p']->fresh(), ['status' => ProjectStatus::Completed->value], $grace));
        });

        /* ------------------------------------------------------------------ 5. Data Warehouse (on hold) */
        $this->at(-30, function () use ($admin, $daniel, $james, $d) {
            $p = ProjectService::create([
                'name' => 'Finance Data Warehouse', 'description' => 'Consolidate finance reporting sources into a single warehouse.',
                'owner_id' => $daniel->id, 'priority' => 'medium', 'color' => 'sky',
                'start_date' => $d(0), 'due_date' => $d(120), 'member_ids' => [$james->id],
            ], $admin);
            TaskService::create(['project_id' => $p->id, 'title' => 'Source system inventory', 'assignee_id' => $daniel->id, 'due_date' => $d(20), 'progress' => 80], $daniel);
            TaskService::create(['project_id' => $p->id, 'title' => 'Warehouse schema design', 'assignee_id' => $james->id, 'due_date' => $d(50)], $daniel);

            return compact('p');
        }, function (array $x) use ($admin) {
            $this->at(-10, fn () => ProjectService::update($x['p']->fresh(), ['status' => ProjectStatus::OnHold->value], $admin));
        });

        /* ------------------------------------------------------------------ Today-ish work so dashboards are lively */
        $portal = \App\Models\Project::query()->where('name', 'Customer Portal Launch')->first();
        $office = \App\Models\Project::query()->where('name', 'Head Office Relocation')->first();
        $this->at(-1, function () use ($portal, $office, $maria, $liam, $james, $daniel, $admin, $d) {
            TaskService::create(['project_id' => $portal->id, 'title' => 'Prepare demo for steering committee', 'assignee_id' => $maria->id, 'priority' => 'urgent', 'due_date' => $d(2), 'collaborator_ids' => [$james->id]], $maria);
            TaskService::create(['project_id' => $portal->id, 'title' => 'Accessibility audit', 'assignee_id' => $liam->id, 'priority' => 'medium', 'due_date' => $d(3)], $maria);
            TaskService::create(['project_id' => $office->id, 'title' => 'Order furniture for level 3', 'assignee_id' => $daniel->id, 'priority' => 'medium', 'due_date' => $d(1)], $admin);
            $office->members()->syncWithoutDetaching([$admin->id => ['role' => ProjectMemberRole::Member->value]]);
        });

        foreach ([$admin, $maria, $james, $aisha] as $i => $user) {
            ActivityLogger::log('auth.login', $user->name.' signed in', $user, [], $user);
        }

        // Bring statuses, reminders and health up to date for "today".
        DeadlineService::run();
    }

    /** Run $callback as if it were $days from today (so history has realistic timestamps). */
    private function at(int $days, callable $callback, ?callable $then = null): mixed
    {
        Carbon::setTestNow(now()->startOfDay()->addDays($days)->setTime(9 + abs($days) % 8, (abs($days) * 7) % 60));
        try {
            $result = $callback();
        } finally {
            Carbon::setTestNow();
        }

        if ($then) {
            $then($result);
        }

        return $result;
    }

    private function comment(Task $task, User $user, string $body): TaskComment
    {
        $comment = TaskComment::query()->create(['task_id' => $task->id, 'user_id' => $user->id, 'body' => $body]);
        ActivityLogger::log('comment.added', $user->name.' commented on "'.$task->title.'"', $task, [], $user);
        NotificationService::mentions($body, $task, $comment, $user);

        return $comment;
    }
}
