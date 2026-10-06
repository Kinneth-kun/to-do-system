-- Subtasks are removed as a feature. Dropping parent_id turns any existing subtask into an ordinary
-- task in the same project (or standalone); nothing else is lost, and its history stays.
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_parent_id_tasks_id_fk";
--> statement-breakpoint
DROP INDEX "tasks_project_parent_index";--> statement-breakpoint
CREATE INDEX "tasks_project_index" ON "tasks" USING btree ("project_id");--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "parent_id";