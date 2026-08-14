CREATE TABLE "studio_settings" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "business_name" TEXT NOT NULL DEFAULT 'Dear Angel Nail Studio',
  "tagline" TEXT NOT NULL DEFAULT 'Una carta al autocuidado y la belleza.',
  "city" TEXT NOT NULL DEFAULT 'Mérida',
  "state" TEXT NOT NULL DEFAULT 'Yucatán',
  "address_line" TEXT,
  "public_phone" TEXT,
  "whatsapp" TEXT,
  "instagram_url" TEXT,
  "facebook_url" TEXT,
  "tiktok_url" TEXT,
  "website_url" TEXT,
  "map_url" TEXT,
  "logo_object_key" TEXT,
  "logo_mime_type" TEXT,
  "logo_filename" TEXT,
  "icon_object_key" TEXT,
  "icon_mime_type" TEXT,
  "icon_filename" TEXT,
  "brand_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "studio_settings_pkey" PRIMARY KEY ("id")
);

INSERT INTO "studio_settings" ("id", "updated_at") VALUES ('default', CURRENT_TIMESTAMP);
