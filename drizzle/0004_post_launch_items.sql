ALTER TABLE "tasks" ADD COLUMN "category" varchar(20);--> statement-breakpoint
CREATE INDEX "tasks_project_category_index" ON "tasks" USING btree ("project_id","category");