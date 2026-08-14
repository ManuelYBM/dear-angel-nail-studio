CREATE EXTENSION IF NOT EXISTS "btree_gist";

CREATE TABLE "system_settings" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);
