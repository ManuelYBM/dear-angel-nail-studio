-- Preserve the business invariant of a single non-archived administrator.
CREATE UNIQUE INDEX "users_single_active_admin"
ON "users" ("role")
WHERE "role" = 'ADMIN' AND "archived_at" IS NULL;

