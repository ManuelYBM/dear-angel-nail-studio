CREATE TYPE "CalculatorOptionKind" AS ENUM ('TECHNIQUE', 'LENGTH', 'DECORATION', 'EXTRA');
CREATE TYPE "CalculatorPricingMode" AS ENUM ('FIXED', 'PER_UNIT');
CREATE TYPE "QuoteStatus" AS ENUM ('PENDING_REVIEW', 'IN_REVIEW', 'APPROVED', 'REJECTED');

CREATE TABLE "calculator_options" (
  "id" UUID NOT NULL,
  "kind" "CalculatorOptionKind" NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "icon_text" TEXT,
  "icon_object_key" TEXT,
  "icon_mime_type" TEXT,
  "price_cents" INTEGER NOT NULL DEFAULT 0,
  "duration_minutes" INTEGER NOT NULL DEFAULT 0,
  "pricing_mode" "CalculatorPricingMode" NOT NULL DEFAULT 'FIXED',
  "max_quantity" INTEGER NOT NULL DEFAULT 1,
  "parent_option_id" UUID,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "calculator_options_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "catalog_designs" (
  "id" UUID NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "price_cents" INTEGER NOT NULL,
  "duration_minutes" INTEGER NOT NULL,
  "technique" TEXT NOT NULL,
  "nail_length" TEXT,
  "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "published" BOOLEAN NOT NULL DEFAULT false,
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "catalog_designs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "catalog_design_images" (
  "id" UUID NOT NULL,
  "design_id" UUID NOT NULL,
  "object_key" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "catalog_design_images_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "catalog_favorites" (
  "user_id" UUID NOT NULL,
  "design_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "catalog_favorites_pkey" PRIMARY KEY ("user_id", "design_id")
);

CREATE TABLE "custom_quotes" (
  "id" UUID NOT NULL,
  "client_id" UUID NOT NULL,
  "preferred_technician_id" UUID,
  "assigned_technician_id" UUID,
  "reviewed_by_user_id" UUID,
  "status" "QuoteStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
  "no_design" BOOLEAN NOT NULL DEFAULT false,
  "estimated_price_cents" INTEGER NOT NULL,
  "estimated_duration_minutes" INTEGER NOT NULL,
  "confirmed_price_cents" INTEGER,
  "confirmed_duration_minutes" INTEGER,
  "client_notes" TEXT,
  "reviewer_comments" TEXT,
  "price_breakdown" JSONB NOT NULL,
  "claimed_at" TIMESTAMPTZ,
  "reviewed_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "custom_quotes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quote_selections" (
  "id" UUID NOT NULL,
  "quote_id" UUID NOT NULL,
  "option_id" UUID NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unit_price_cents" INTEGER NOT NULL,
  "option_name" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quote_selections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "quote_images" (
  "id" UUID NOT NULL,
  "quote_id" UUID NOT NULL,
  "object_key" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "quote_images_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "appointments" ADD COLUMN "catalog_design_id" UUID;
ALTER TABLE "appointments" ADD COLUMN "custom_quote_id" UUID;

CREATE UNIQUE INDEX "calculator_options_code_key" ON "calculator_options"("code");
CREATE INDEX "calculator_options_kind_active_sort_order_idx" ON "calculator_options"("kind", "active", "sort_order");
CREATE INDEX "calculator_options_parent_option_id_idx" ON "calculator_options"("parent_option_id");
CREATE INDEX "catalog_designs_published_featured_sort_order_idx" ON "catalog_designs"("published", "featured", "sort_order");
CREATE INDEX "catalog_designs_technique_idx" ON "catalog_designs"("technique");
CREATE INDEX "catalog_design_images_design_id_sort_order_idx" ON "catalog_design_images"("design_id", "sort_order");
CREATE INDEX "catalog_favorites_design_id_idx" ON "catalog_favorites"("design_id");
CREATE INDEX "custom_quotes_client_id_created_at_idx" ON "custom_quotes"("client_id", "created_at");
CREATE INDEX "custom_quotes_status_assigned_technician_id_created_at_idx" ON "custom_quotes"("status", "assigned_technician_id", "created_at");
CREATE INDEX "custom_quotes_preferred_technician_id_status_idx" ON "custom_quotes"("preferred_technician_id", "status");
CREATE UNIQUE INDEX "quote_selections_quote_id_option_id_key" ON "quote_selections"("quote_id", "option_id");
CREATE INDEX "quote_selections_option_id_idx" ON "quote_selections"("option_id");
CREATE INDEX "quote_images_quote_id_sort_order_idx" ON "quote_images"("quote_id", "sort_order");
CREATE UNIQUE INDEX "appointments_custom_quote_id_key" ON "appointments"("custom_quote_id");
CREATE INDEX "appointments_catalog_design_id_idx" ON "appointments"("catalog_design_id");

ALTER TABLE "calculator_options" ADD CONSTRAINT "calculator_options_parent_option_id_fkey" FOREIGN KEY ("parent_option_id") REFERENCES "calculator_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "catalog_designs" ADD CONSTRAINT "catalog_designs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "catalog_design_images" ADD CONSTRAINT "catalog_design_images_design_id_fkey" FOREIGN KEY ("design_id") REFERENCES "catalog_designs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_favorites" ADD CONSTRAINT "catalog_favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "catalog_favorites" ADD CONSTRAINT "catalog_favorites_design_id_fkey" FOREIGN KEY ("design_id") REFERENCES "catalog_designs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "custom_quotes" ADD CONSTRAINT "custom_quotes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "custom_quotes" ADD CONSTRAINT "custom_quotes_preferred_technician_id_fkey" FOREIGN KEY ("preferred_technician_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "custom_quotes" ADD CONSTRAINT "custom_quotes_assigned_technician_id_fkey" FOREIGN KEY ("assigned_technician_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "custom_quotes" ADD CONSTRAINT "custom_quotes_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "quote_selections" ADD CONSTRAINT "quote_selections_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "custom_quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "quote_selections" ADD CONSTRAINT "quote_selections_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "calculator_options"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "quote_images" ADD CONSTRAINT "quote_images_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "custom_quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_catalog_design_id_fkey" FOREIGN KEY ("catalog_design_id") REFERENCES "catalog_designs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_custom_quote_id_fkey" FOREIGN KEY ("custom_quote_id") REFERENCES "custom_quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
