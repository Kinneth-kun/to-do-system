<?php

use App\Enums\Department;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Departments used to be free text. They are now one of App\Enums\Department, so existing
 * values are mapped onto the official list and the column is indexed for filtering.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('users')->select('id', 'department')->whereNotNull('department')->orderBy('id')
            ->chunk(200, function ($users) {
                foreach ($users as $user) {
                    DB::table('users')->where('id', $user->id)->update([
                        'department' => Department::fromLabel($user->department)?->value,
                    ]);
                }
            });

        Schema::table('users', function (Blueprint $table) {
            $table->index('department');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex(['department']);
        });

        DB::table('users')->select('id', 'department')->whereNotNull('department')->orderBy('id')
            ->chunk(200, function ($users) {
                foreach ($users as $user) {
                    DB::table('users')->where('id', $user->id)->update([
                        'department' => Department::tryFrom($user->department)?->label(),
                    ]);
                }
            });
    }
};
