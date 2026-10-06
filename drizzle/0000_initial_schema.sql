CREATE TABLE "activity_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"action" varchar(60) NOT NULL,
	"description" varchar(255) NOT NULL,
	"subject_type" varchar(40),
	"subject_id" integer,
	"properties" jsonb,
	"ip_address" varchar(45),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"attachable_type" varchar(40) NOT NULL,
	"attachable_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"original_name" varchar(255) NOT NULL,
	"path" varchar(500) NOT NULL,
	"disk" varchar(30) DEFAULT 'local' NOT NULL,
	"mime_type" varchar(150),
	"size" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locks" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"actor_id" integer,
	"type" varchar(40) NOT NULL,
	"title" varchar(255) NOT NULL,
	"message" text,
	"url" varchar(500),
	"subject_type" varchar(40),
	"subject_id" integer,
	"data" jsonb,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" varchar(20) DEFAULT 'member' NOT NULL,
	"added_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"owner_id" integer NOT NULL,
	"created_by" integer NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"priority" varchar(20) DEFAULT 'medium' NOT NULL,
	"color" varchar(20) DEFAULT 'indigo' NOT NULL,
	"start_date" date,
	"due_date" date,
	"completed_at" timestamp with time zone,
	"progress" smallint DEFAULT 0 NOT NULL,
	"health" varchar(20) DEFAULT 'on_track' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" varchar(150) PRIMARY KEY NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL,
	"label" varchar(100) NOT NULL,
	"description" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"remember" boolean DEFAULT false NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text,
	"last_activity" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(100) NOT NULL,
	"value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "task_collaborators" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"added_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_updates" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"user_id" integer,
	"type" varchar(30) NOT NULL,
	"old_status" varchar(20),
	"new_status" varchar(20),
	"old_progress" smallint,
	"new_progress" smallint,
	"remark" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"parent_id" integer,
	"title" varchar(255) NOT NULL,
	"description" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"status_before_delay" varchar(20),
	"priority" varchar(20) DEFAULT 'medium' NOT NULL,
	"progress" smallint DEFAULT 0 NOT NULL,
	"assignee_id" integer,
	"created_by" integer NOT NULL,
	"start_date" date,
	"due_date" date,
	"completed_at" timestamp with time zone,
	"delayed_at" timestamp with time zone,
	"latest_remark" text,
	"latest_update_at" timestamp with time zone,
	"latest_update_by" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"role_id" integer NOT NULL,
	"name" varchar(255) NOT NULL,
	"username" varchar(50) NOT NULL,
	"email" varchar(255) NOT NULL,
	"job_title" varchar(255),
	"department" varchar(40),
	"avatar_color" varchar(20) DEFAULT 'indigo' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"email_verified_at" timestamp with time zone,
	"password" varchar(255) NOT NULL,
	"failed_login_attempts" smallint DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"last_login_ip" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_collaborators" ADD CONSTRAINT "task_collaborators_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_collaborators" ADD CONSTRAINT "task_collaborators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_collaborators" ADD CONSTRAINT "task_collaborators_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_comments" ADD CONSTRAINT "task_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_updates" ADD CONSTRAINT "task_updates_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_updates" ADD CONSTRAINT "task_updates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_id_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_latest_update_by_users_id_fk" FOREIGN KEY ("latest_update_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_logs_action_index" ON "activity_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "activity_logs_created_index" ON "activity_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "activity_logs_user_index" ON "activity_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "attachments_attachable_index" ON "attachments" USING btree ("attachable_type","attachable_id");--> statement-breakpoint
CREATE INDEX "notifications_type_index" ON "notifications" USING btree ("type");--> statement-breakpoint
CREATE INDEX "notifications_user_read_index" ON "notifications" USING btree ("user_id","read_at");--> statement-breakpoint
CREATE INDEX "notifications_subject_index" ON "notifications" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_members_project_user_unique" ON "project_members" USING btree ("project_id","user_id");--> statement-breakpoint
CREATE INDEX "project_members_user_index" ON "project_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "projects_status_index" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "projects_due_date_index" ON "projects" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "projects_health_index" ON "projects" USING btree ("health");--> statement-breakpoint
CREATE INDEX "sessions_user_id_index" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_collaborators_task_user_unique" ON "task_collaborators" USING btree ("task_id","user_id");--> statement-breakpoint
CREATE INDEX "task_collaborators_user_index" ON "task_collaborators" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "task_comments_task_index" ON "task_comments" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_updates_type_index" ON "task_updates" USING btree ("type");--> statement-breakpoint
CREATE INDEX "task_updates_task_created_index" ON "task_updates" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "tasks_status_index" ON "tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tasks_priority_index" ON "tasks" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "tasks_due_date_index" ON "tasks" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "tasks_project_parent_index" ON "tasks" USING btree ("project_id","parent_id");--> statement-breakpoint
CREATE INDEX "tasks_assignee_status_index" ON "tasks" USING btree ("assignee_id","status");--> statement-breakpoint
CREATE INDEX "users_department_index" ON "users" USING btree ("department");