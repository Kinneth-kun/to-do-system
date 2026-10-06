import './lib/env';
import { ensureDatabase } from './lib/local-db';

/** Mark overdue tasks Delayed, send due-soon reminders and refresh project health (artisan taskflow:check-deadlines). */

const database = await ensureDatabase({ quiet: true });
const { closeDb } = await import('../src/lib/db');
const { DeadlineService } = await import('../src/lib/services/deadlines');

try {
    const result = await DeadlineService.run();
    console.log(`Marked ${result.delayed} task(s) delayed, sent ${result.reminders} deadline reminder(s), refreshed ${result.projects} project(s).`);
} finally {
    await closeDb();
    await database.stop();
}
