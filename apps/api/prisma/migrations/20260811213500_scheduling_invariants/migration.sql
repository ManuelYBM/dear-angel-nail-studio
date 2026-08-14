ALTER TABLE "global_working_periods"
  ADD CONSTRAINT "global_period_valid_day" CHECK ("day_of_week" BETWEEN 1 AND 7),
  ADD CONSTRAINT "global_period_valid_range" CHECK (
    "start_minute" >= 0 AND "end_minute" <= 1440 AND "start_minute" < "end_minute"
  );

ALTER TABLE "technician_working_periods"
  ADD CONSTRAINT "technician_period_valid_day" CHECK ("day_of_week" BETWEEN 1 AND 7),
  ADD CONSTRAINT "technician_period_valid_range" CHECK (
    "start_minute" >= 0 AND "end_minute" <= 1440 AND "start_minute" < "end_minute"
  );

ALTER TABLE "schedule_override_periods"
  ADD CONSTRAINT "override_period_valid_range" CHECK (
    "start_minute" >= 0 AND "end_minute" <= 1440 AND "start_minute" < "end_minute"
  );

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointment_valid_range" CHECK ("start_at" < "end_at"),
  ADD CONSTRAINT "appointment_valid_duration" CHECK ("duration_minutes" BETWEEN 15 AND 720),
  ADD CONSTRAINT "appointment_has_client" CHECK (
    "client_id" IS NOT NULL OR NULLIF(TRIM("guest_name"), '') IS NOT NULL
  );

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_overlap"
  EXCLUDE USING gist (
    "technician_id" WITH =,
    tstzrange("start_at", "end_at", '[)') WITH &&
  )
  WHERE ("status" IN ('HELD', 'PENDING_PAYMENT', 'CONFIRMED'));

