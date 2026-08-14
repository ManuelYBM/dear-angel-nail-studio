CREATE TYPE "DepositStatus" AS ENUM (
  'AWAITING_RECEIPT',
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'EXPIRED',
  'CANCELLED'
);

CREATE TABLE "payment_settings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "amount_cents" INTEGER NOT NULL DEFAULT 10000,
  "recipient_name" TEXT NOT NULL DEFAULT 'Dear Angel Nail Studio',
  "bank_name" TEXT NOT NULL DEFAULT 'Configurar banco',
  "clabe" TEXT NOT NULL DEFAULT '000000000000000000',
  "account_number" TEXT,
  "transfer_notes" TEXT NOT NULL DEFAULT 'Escribe la referencia exactamente como aparece en tu reservación.',
  "policy_version" TEXT NOT NULL DEFAULT '2026-08-12',
  "policy_text" TEXT NOT NULL DEFAULT 'El anticipo no es reembolsable. Puedes reprogramar una sola vez con al menos 24 horas de anticipación.',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "payment_settings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_settings_amount_positive" CHECK ("amount_cents" > 0),
  CONSTRAINT "payment_settings_clabe_format" CHECK ("clabe" ~ '^[0-9]{18}$')
);

INSERT INTO "payment_settings" (
  "id", "amount_cents", "recipient_name", "bank_name", "clabe", "account_number",
  "transfer_notes", "policy_version", "policy_text", "updated_at"
) VALUES (
  'default', 10000, 'Dear Angel Nail Studio', 'Configurar banco', '000000000000000000', NULL,
  'Escribe la referencia exactamente como aparece en tu reservación.', '2026-08-12',
  'El anticipo no es reembolsable. Puedes reprogramar una sola vez con al menos 24 horas de anticipación.',
  CURRENT_TIMESTAMP
);

CREATE TABLE "deposit_payments" (
  "id" UUID NOT NULL,
  "appointment_id" UUID NOT NULL,
  "reference" TEXT NOT NULL,
  "amount_cents" INTEGER NOT NULL,
  "status" "DepositStatus" NOT NULL DEFAULT 'AWAITING_RECEIPT',
  "recipient_name_snapshot" TEXT NOT NULL,
  "bank_name_snapshot" TEXT NOT NULL,
  "clabe_snapshot" TEXT NOT NULL,
  "account_number_snapshot" TEXT,
  "transfer_notes_snapshot" TEXT NOT NULL,
  "object_key" TEXT,
  "mime_type" TEXT,
  "filename" TEXT,
  "size_bytes" INTEGER,
  "receipt_uploaded_at" TIMESTAMPTZ,
  "retention_until" TIMESTAMPTZ,
  "accepted_policy_version" TEXT,
  "accepted_policies_at" TIMESTAMPTZ,
  "reviewed_by_user_id" UUID,
  "reviewed_at" TIMESTAMPTZ,
  "review_notes" TEXT,
  "confirmation_code" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "deposit_payments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "deposit_payments_amount_positive" CHECK ("amount_cents" > 0),
  CONSTRAINT "deposit_payments_clabe_format" CHECK ("clabe_snapshot" ~ '^[0-9]{18}$'),
  CONSTRAINT "deposit_payments_file_complete" CHECK (
    ("object_key" IS NULL AND "mime_type" IS NULL AND "filename" IS NULL AND "size_bytes" IS NULL AND "receipt_uploaded_at" IS NULL AND "retention_until" IS NULL)
    OR
    ("object_key" IS NOT NULL AND "mime_type" IS NOT NULL AND "filename" IS NOT NULL AND "size_bytes" > 0 AND "receipt_uploaded_at" IS NOT NULL AND "retention_until" IS NOT NULL)
  ),
  CONSTRAINT "deposit_payments_policy_acceptance_complete" CHECK (
    ("accepted_policy_version" IS NULL AND "accepted_policies_at" IS NULL)
    OR
    ("accepted_policy_version" IS NOT NULL AND "accepted_policies_at" IS NOT NULL)
  ),
  CONSTRAINT "deposit_payments_state_valid" CHECK (
    ("status" IN ('AWAITING_RECEIPT', 'EXPIRED', 'CANCELLED'))
    OR
    ("status" IN ('PENDING_REVIEW', 'REJECTED') AND "object_key" IS NOT NULL AND "accepted_policy_version" IS NOT NULL)
    OR
    ("status" = 'APPROVED' AND "object_key" IS NOT NULL AND "accepted_policy_version" IS NOT NULL AND "reviewed_by_user_id" IS NOT NULL AND "reviewed_at" IS NOT NULL AND "confirmation_code" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "deposit_payments_appointment_id_key" ON "deposit_payments"("appointment_id");
CREATE UNIQUE INDEX "deposit_payments_reference_key" ON "deposit_payments"("reference");
CREATE UNIQUE INDEX "deposit_payments_confirmation_code_key" ON "deposit_payments"("confirmation_code");
CREATE INDEX "deposit_payments_status_created_at_idx" ON "deposit_payments"("status", "created_at");
CREATE INDEX "deposit_payments_retention_until_idx" ON "deposit_payments"("retention_until");
CREATE INDEX "deposit_payments_reviewed_by_user_id_reviewed_at_idx" ON "deposit_payments"("reviewed_by_user_id", "reviewed_at");

ALTER TABLE "deposit_payments"
  ADD CONSTRAINT "deposit_payments_appointment_id_fkey"
  FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "deposit_payments"
  ADD CONSTRAINT "deposit_payments_reviewed_by_user_id_fkey"
  FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "deposit_payments" (
  "id", "appointment_id", "reference", "amount_cents", "status",
  "recipient_name_snapshot", "bank_name_snapshot", "clabe_snapshot",
  "account_number_snapshot", "transfer_notes_snapshot", "created_at", "updated_at"
)
SELECT
  gen_random_uuid(), a."id", 'DA-MIG-' || UPPER(SUBSTRING(REPLACE(a."id"::text, '-', '') FROM 1 FOR 10)),
  s."amount_cents",
  CASE WHEN a."status" = 'PENDING_PAYMENT' THEN 'AWAITING_RECEIPT'::"DepositStatus" ELSE 'AWAITING_RECEIPT'::"DepositStatus" END,
  s."recipient_name", s."bank_name", s."clabe", s."account_number", s."transfer_notes",
  a."created_at", CURRENT_TIMESTAMP
FROM "appointments" a
CROSS JOIN "payment_settings" s
WHERE a."source" = 'ONLINE' AND a."status" IN ('HELD', 'PENDING_PAYMENT');
