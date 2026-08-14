ALTER TABLE "deposit_payments"
  ADD COLUMN "receipt_purged_at" TIMESTAMPTZ;

UPDATE "payment_settings"
SET
  "policy_version" = '2026-08-12-r1',
  "policy_text" = 'El anticipo no es reembolsable en caso de cancelación o inasistencia. Puedes reprogramar una sola vez con el mismo anticipo y al menos 24 horas de anticipación. Adultos asisten sin niñas, niños ni acompañantes. Las personas menores de 16 años deben asistir con una persona adulta. Hay 10 minutos de tolerancia.',
  "updated_at" = CURRENT_TIMESTAMP
WHERE
  "id" = 'default'
  AND "policy_version" = '2026-08-12'
  AND "policy_text" = 'El anticipo no es reembolsable. Puedes reprogramar una sola vez con al menos 24 horas de anticipación.';

ALTER TABLE "deposit_payments"
  DROP CONSTRAINT "deposit_payments_state_valid";

ALTER TABLE "deposit_payments"
  ADD CONSTRAINT "deposit_payments_state_valid" CHECK (
    ("status" IN ('AWAITING_RECEIPT', 'EXPIRED', 'CANCELLED'))
    OR
    (
      "status" IN ('PENDING_REVIEW', 'REJECTED')
      AND "accepted_policy_version" IS NOT NULL
      AND ("object_key" IS NOT NULL OR "receipt_purged_at" IS NOT NULL)
    )
    OR
    (
      "status" = 'APPROVED'
      AND "accepted_policy_version" IS NOT NULL
      AND "reviewed_by_user_id" IS NOT NULL
      AND "reviewed_at" IS NOT NULL
      AND "confirmation_code" IS NOT NULL
      AND ("object_key" IS NOT NULL OR "receipt_purged_at" IS NOT NULL)
    )
  );
