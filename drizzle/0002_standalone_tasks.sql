ALTER TABLE "tasks" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
CREATE INDEX "tasks_created_by_index" ON "tasks" USING btree ("created_by");