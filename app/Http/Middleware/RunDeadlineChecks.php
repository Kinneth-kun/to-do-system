<?php

namespace App\Http\Middleware;

use App\Services\DeadlineService;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;
use Throwable;

/**
 * Keeps delayed statuses and deadline reminders current even when no cron/scheduler is configured.
 * Runs after the response is prepared, at most every 5 minutes.
 */
class RunDeadlineChecks
{
    public function handle(Request $request, Closure $next): Response
    {
        return $next($request);
    }

    public function terminate(Request $request, Response $response): void
    {
        if (app()->runningUnitTests() || ! $request->user()) {
            return;
        }

        try {
            DeadlineService::runThrottled(300);
        } catch (Throwable $e) {
            Log::warning('Deadline check failed: '.$e->getMessage());
        }
    }
}
