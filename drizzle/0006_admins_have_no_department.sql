-- Administrators don't belong to a department and have no job title.
UPDATE "users" SET "department" = NULL, "job_title" = NULL
WHERE "role_id" IN (SELECT "id" FROM "roles" WHERE "name" = 'admin');
