<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tasks', function (Blueprint $table) {
            $table->id();
            // Business rule: every task belongs to a project.
            $table->foreignId('project_id')->constrained()->cascadeOnDelete();
            // Null = top-level task; otherwise a subtask (one level deep).
            $table->foreignId('parent_id')->nullable()->constrained('tasks')->cascadeOnDelete();
            $table->string('title');
            $table->text('description')->nullable();
            $table->string('status', 20)->default('pending')->index();     // App\Enums\TaskStatus
            $table->string('status_before_delay', 20)->nullable();
            $table->string('priority', 20)->default('medium')->index();    // App\Enums\Priority
            $table->unsignedTinyInteger('progress')->default(0);
            // Business rule: a single primary assignee.
            $table->foreignId('assignee_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('created_by')->constrained('users');
            $table->date('start_date')->nullable();
            $table->date('due_date')->nullable()->index();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('delayed_at')->nullable();
            // Denormalised "latest update" for fast list rendering.
            $table->text('latest_remark')->nullable();
            $table->timestamp('latest_update_at')->nullable();
            $table->foreignId('latest_update_by')->nullable()->constrained('users')->nullOnDelete();
            $table->unsignedInteger('position')->default(0);
            $table->timestamps();
            $table->softDeletes();

            $table->index(['project_id', 'parent_id']);
            $table->index(['assignee_id', 'status']);
        });

        Schema::create('task_collaborators', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('added_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->unique(['task_id', 'user_id']);
        });

        // Append-only history. Rows are never updated or deleted by the application.
        Schema::create('task_updates', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete(); // null = system
            $table->string('type', 30)->index(); // App\Enums\TaskUpdateType
            $table->string('old_status', 20)->nullable();
            $table->string('new_status', 20)->nullable();
            $table->unsignedTinyInteger('old_progress')->nullable();
            $table->unsignedTinyInteger('new_progress')->nullable();
            $table->text('remark')->nullable();
            $table->json('meta')->nullable();
            $table->timestamps();
            $table->index(['task_id', 'created_at']);
        });

        Schema::create('task_comments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('task_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->text('body');
            $table->timestamps();
        });

        Schema::create('attachments', function (Blueprint $table) {
            $table->id();
            $table->morphs('attachable'); // Task (or TaskComment)
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('original_name');
            $table->string('path');
            $table->string('disk', 30)->default('local');
            $table->string('mime_type', 150)->nullable();
            $table->unsignedBigInteger('size')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attachments');
        Schema::dropIfExists('task_comments');
        Schema::dropIfExists('task_updates');
        Schema::dropIfExists('task_collaborators');
        Schema::dropIfExists('tasks');
    }
};
