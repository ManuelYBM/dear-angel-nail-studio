CREATE TYPE "NotificationKind" AS ENUM ('APPOINTMENT', 'QUOTE', 'PAYMENT', 'COUPON', 'REMINDER', 'SYSTEM');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'SKIPPED');
CREATE TYPE "CalendarSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED', 'DELETED');

CREATE TABLE "notification_templates" (
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "title_template" TEXT NOT NULL,
  "body_template" TEXT NOT NULL,
  "default_channel" "DeliveryChannel",
  "whatsapp_template_name" TEXT,
  "whatsapp_parameter_keys" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "notifications" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "template_key" TEXT,
  "kind" "NotificationKind" NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "action_url" TEXT,
  "payload" JSONB,
  "dedupe_key" TEXT,
  "read_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "notification_deliveries" (
  "id" UUID NOT NULL,
  "notification_id" UUID NOT NULL,
  "channel" "DeliveryChannel" NOT NULL,
  "destination" TEXT NOT NULL,
  "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_at" TIMESTAMPTZ,
  "provider" TEXT,
  "external_id" TEXT,
  "last_error" TEXT,
  "sent_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "calendar_connections" (
  "user_id" UUID NOT NULL,
  "calendar_id" TEXT NOT NULL DEFAULT 'primary',
  "encrypted_access_token" TEXT,
  "encrypted_refresh_token" TEXT,
  "token_expires_at" TIMESTAMPTZ,
  "connected_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_sync_at" TIMESTAMPTZ,
  "last_error" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "calendar_connections_pkey" PRIMARY KEY ("user_id")
);

CREATE TABLE "calendar_event_links" (
  "appointment_id" UUID NOT NULL,
  "technician_id" UUID NOT NULL,
  "external_event_id" TEXT,
  "status" "CalendarSyncStatus" NOT NULL DEFAULT 'PENDING',
  "last_error" TEXT,
  "last_synced_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "calendar_event_links_pkey" PRIMARY KEY ("appointment_id")
);

CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at");
CREATE INDEX "notifications_kind_created_at_idx" ON "notifications"("kind", "created_at");
CREATE UNIQUE INDEX "notification_deliveries_notification_id_channel_key" ON "notification_deliveries"("notification_id", "channel");
CREATE INDEX "notification_deliveries_status_next_attempt_at_idx" ON "notification_deliveries"("status", "next_attempt_at");
CREATE INDEX "calendar_event_links_technician_id_status_idx" ON "calendar_event_links"("technician_id", "status");

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_template_key_fkey" FOREIGN KEY ("template_key") REFERENCES "notification_templates"("key") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendar_connections" ADD CONSTRAINT "calendar_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendar_event_links" ADD CONSTRAINT "calendar_event_links_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendar_event_links" ADD CONSTRAINT "calendar_event_links_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
