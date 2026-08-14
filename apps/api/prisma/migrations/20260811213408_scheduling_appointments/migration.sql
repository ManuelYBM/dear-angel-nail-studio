-- CreateEnum
CREATE TYPE "AppointmentSource" AS ENUM ('ONLINE', 'MANUAL');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('HELD', 'PENDING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW', 'EXPIRED');

-- CreateTable
CREATE TABLE "booking_policies" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "default_duration_minutes" INTEGER NOT NULL DEFAULT 60,
    "slot_interval_minutes" INTEGER NOT NULL DEFAULT 60,
    "minimum_lead_minutes" INTEGER NOT NULL DEFAULT 240,
    "maximum_advance_days" INTEGER NOT NULL DEFAULT 14,
    "hold_minutes" INTEGER NOT NULL DEFAULT 10,
    "reschedule_notice_hours" INTEGER NOT NULL DEFAULT 24,
    "client_reschedule_limit" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "booking_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "global_working_periods" (
    "id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "global_working_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technician_schedules" (
    "technician_id" UUID NOT NULL,
    "uses_global_schedule" BOOLEAN NOT NULL DEFAULT true,
    "accepting_bookings" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "technician_schedules_pkey" PRIMARY KEY ("technician_id")
);

-- CreateTable
CREATE TABLE "technician_working_periods" (
    "id" UUID NOT NULL,
    "technician_id" UUID NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "technician_working_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_day_overrides" (
    "id" UUID NOT NULL,
    "technician_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "schedule_day_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_override_periods" (
    "id" UUID NOT NULL,
    "override_id" UUID NOT NULL,
    "start_minute" INTEGER NOT NULL,
    "end_minute" INTEGER NOT NULL,

    CONSTRAINT "schedule_override_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "technician_id" UUID NOT NULL,
    "client_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "source" "AppointmentSource" NOT NULL,
    "status" "AppointmentStatus" NOT NULL,
    "start_at" TIMESTAMPTZ NOT NULL,
    "end_at" TIMESTAMPTZ NOT NULL,
    "duration_minutes" INTEGER NOT NULL,
    "hold_expires_at" TIMESTAMPTZ,
    "client_reschedule_count" INTEGER NOT NULL DEFAULT 0,
    "guest_name" TEXT,
    "guest_phone" TEXT,
    "notes" TEXT,
    "cancelled_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "global_working_periods_day_of_week_idx" ON "global_working_periods"("day_of_week");

-- CreateIndex
CREATE UNIQUE INDEX "global_working_periods_day_of_week_start_minute_end_minute_key" ON "global_working_periods"("day_of_week", "start_minute", "end_minute");

-- CreateIndex
CREATE INDEX "technician_working_periods_technician_id_day_of_week_idx" ON "technician_working_periods"("technician_id", "day_of_week");

-- CreateIndex
CREATE UNIQUE INDEX "technician_working_periods_technician_id_day_of_week_start__key" ON "technician_working_periods"("technician_id", "day_of_week", "start_minute", "end_minute");

-- CreateIndex
CREATE INDEX "schedule_day_overrides_date_idx" ON "schedule_day_overrides"("date");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_day_overrides_technician_id_date_key" ON "schedule_day_overrides"("technician_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_override_periods_override_id_start_minute_end_minu_key" ON "schedule_override_periods"("override_id", "start_minute", "end_minute");

-- CreateIndex
CREATE INDEX "appointments_technician_id_start_at_idx" ON "appointments"("technician_id", "start_at");

-- CreateIndex
CREATE INDEX "appointments_client_id_start_at_idx" ON "appointments"("client_id", "start_at");

-- CreateIndex
CREATE INDEX "appointments_status_hold_expires_at_idx" ON "appointments"("status", "hold_expires_at");

-- AddForeignKey
ALTER TABLE "technician_schedules" ADD CONSTRAINT "technician_schedules_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technician_working_periods" ADD CONSTRAINT "technician_working_periods_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "technician_schedules"("technician_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_day_overrides" ADD CONSTRAINT "schedule_day_overrides_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "technician_schedules"("technician_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_override_periods" ADD CONSTRAINT "schedule_override_periods_override_id_fkey" FOREIGN KEY ("override_id") REFERENCES "schedule_day_overrides"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
