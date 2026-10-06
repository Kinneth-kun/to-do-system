-- Business rule: task history is append-only. The Laravel TaskUpdate model threw on update and
-- delete; here the database enforces it. Changes made by foreign-key actions (a task being
-- hard-deleted, a user being removed) run at trigger depth > 1 and are still allowed.
CREATE OR REPLACE FUNCTION task_updates_are_immutable() RETURNS trigger AS $$
BEGIN
    IF pg_trigger_depth() <= 1 THEN
        RAISE EXCEPTION 'Task updates are immutable.';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER task_updates_immutable
    BEFORE UPDATE OR DELETE ON task_updates
    FOR EACH ROW EXECUTE FUNCTION task_updates_are_immutable();
