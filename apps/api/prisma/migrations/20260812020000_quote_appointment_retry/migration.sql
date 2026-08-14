DROP INDEX IF EXISTS "appointments_custom_quote_id_key";

CREATE UNIQUE INDEX "appointments_active_custom_quote_key"
ON "appointments" ("custom_quote_id")
WHERE "custom_quote_id" IS NOT NULL
  AND "status" IN ('HELD', 'PENDING_PAYMENT', 'CONFIRMED');
