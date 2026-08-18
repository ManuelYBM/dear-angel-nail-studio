ALTER TABLE "users"
ADD COLUMN "registration_expires_at" TIMESTAMPTZ;

UPDATE "users" AS "user"
SET "registration_expires_at" = "user"."created_at" + INTERVAL '24 hours'
WHERE "user"."role" = 'CLIENT'
  AND "user"."status" = 'PENDING_VERIFICATION'
  AND "user"."phone_verified_at" IS NULL
  AND "user"."last_login_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "sessions" AS "session" WHERE "session"."user_id" = "user"."id"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "appointments" AS "appointment" WHERE "appointment"."client_id" = "user"."id"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "custom_quotes" AS "quote" WHERE "quote"."client_id" = "user"."id"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "client_visit_entries" AS "visit" WHERE "visit"."client_id" = "user"."id"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "client_coupons" AS "coupon" WHERE "coupon"."client_id" = "user"."id"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "catalog_favorites" AS "favorite" WHERE "favorite"."user_id" = "user"."id"
  )
  AND NOT EXISTS (
    SELECT 1 FROM "notifications" AS "notification" WHERE "notification"."user_id" = "user"."id"
  )
  AND EXISTS (
    SELECT 1
    FROM "audit_logs" AS "audit"
    WHERE "audit"."action" = 'CLIENT_SELF_REGISTERED'
      AND "audit"."entity_id" = "user"."id"::text
  );

CREATE INDEX "users_registration_expires_at_idx"
ON "users"("registration_expires_at");
