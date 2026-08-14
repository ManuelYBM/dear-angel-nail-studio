-- CreateEnum
CREATE TYPE "ClientVisitReason" AS ENUM ('APPOINTMENT_COMPLETED', 'ADMIN_CORRECTION');

-- CreateEnum
CREATE TYPE "CouponSource" AS ENUM ('VISIT_REWARD', 'PROMOTION');

-- CreateEnum
CREATE TYPE "CouponStatus" AS ENUM ('AVAILABLE', 'REDEEMED');

-- CreateTable
CREATE TABLE "client_visit_entries" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "appointment_id" UUID,
    "delta" INTEGER NOT NULL,
    "reason" "ClientVisitReason" NOT NULL,
    "note" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "client_visit_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "client_visit_entries_delta_nonzero" CHECK ("delta" <> 0),
    CONSTRAINT "client_visit_entries_appointment_reason" CHECK (
      ("reason" = 'APPOINTMENT_COMPLETED' AND "appointment_id" IS NOT NULL AND "delta" = 1)
      OR ("reason" = 'ADMIN_CORRECTION' AND "appointment_id" IS NULL)
    )
);

-- CreateTable
CREATE TABLE "reward_rules" (
    "id" UUID NOT NULL,
    "visit_number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon_text" TEXT NOT NULL DEFAULT '✦',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "reward_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reward_rules_visit_positive" CHECK ("visit_number" > 0)
);

-- CreateTable
CREATE TABLE "promotions" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon_text" TEXT NOT NULL DEFAULT '♡',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_coupons" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "reward_rule_id" UUID,
    "promotion_id" UUID,
    "source" "CouponSource" NOT NULL,
    "status" "CouponStatus" NOT NULL DEFAULT 'AVAILABLE',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon_text" TEXT NOT NULL DEFAULT '✦',
    "issued_by_user_id" UUID,
    "redeemed_by_user_id" UUID,
    "redeemed_appointment_id" UUID,
    "redeemed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "client_coupons_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "client_coupons_source_reference" CHECK (
      ("source" = 'VISIT_REWARD' AND "reward_rule_id" IS NOT NULL AND "promotion_id" IS NULL)
      OR ("source" = 'PROMOTION' AND "promotion_id" IS NOT NULL AND "reward_rule_id" IS NULL)
    ),
    CONSTRAINT "client_coupons_redemption_state" CHECK (
      ("status" = 'AVAILABLE' AND "redeemed_at" IS NULL AND "redeemed_by_user_id" IS NULL AND "redeemed_appointment_id" IS NULL)
      OR ("status" = 'REDEEMED' AND "redeemed_at" IS NOT NULL AND "redeemed_by_user_id" IS NOT NULL AND "redeemed_appointment_id" IS NOT NULL)
    )
);

-- CreateIndex
CREATE UNIQUE INDEX "client_visit_entries_appointment_id_key" ON "client_visit_entries"("appointment_id");

-- CreateIndex
CREATE INDEX "client_visit_entries_client_id_created_at_idx" ON "client_visit_entries"("client_id", "created_at");

-- CreateIndex
CREATE INDEX "client_visit_entries_created_by_user_id_created_at_idx" ON "client_visit_entries"("created_by_user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reward_rules_visit_number_key" ON "reward_rules"("visit_number");

-- CreateIndex
CREATE INDEX "reward_rules_active_visit_number_idx" ON "reward_rules"("active", "visit_number");

-- CreateIndex
CREATE UNIQUE INDEX "promotions_code_key" ON "promotions"("code");

-- CreateIndex
CREATE INDEX "promotions_active_created_at_idx" ON "promotions"("active", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "client_coupons_redeemed_appointment_id_key" ON "client_coupons"("redeemed_appointment_id");

-- CreateIndex
CREATE INDEX "client_coupons_client_id_status_created_at_idx" ON "client_coupons"("client_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "client_coupons_reward_rule_id_idx" ON "client_coupons"("reward_rule_id");

-- CreateIndex
CREATE INDEX "client_coupons_promotion_id_idx" ON "client_coupons"("promotion_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_coupons_client_id_reward_rule_id_key" ON "client_coupons"("client_id", "reward_rule_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_coupons_client_id_promotion_id_key" ON "client_coupons"("client_id", "promotion_id");

-- AddForeignKey
ALTER TABLE "client_visit_entries" ADD CONSTRAINT "client_visit_entries_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_visit_entries" ADD CONSTRAINT "client_visit_entries_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_visit_entries" ADD CONSTRAINT "client_visit_entries_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reward_rules" ADD CONSTRAINT "reward_rules_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_coupons" ADD CONSTRAINT "client_coupons_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_coupons" ADD CONSTRAINT "client_coupons_reward_rule_id_fkey" FOREIGN KEY ("reward_rule_id") REFERENCES "reward_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_coupons" ADD CONSTRAINT "client_coupons_promotion_id_fkey" FOREIGN KEY ("promotion_id") REFERENCES "promotions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_coupons" ADD CONSTRAINT "client_coupons_issued_by_user_id_fkey" FOREIGN KEY ("issued_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_coupons" ADD CONSTRAINT "client_coupons_redeemed_by_user_id_fkey" FOREIGN KEY ("redeemed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_coupons" ADD CONSTRAINT "client_coupons_redeemed_appointment_id_fkey" FOREIGN KEY ("redeemed_appointment_id") REFERENCES "appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Preserve completed visits that existed before the loyalty module was installed.
INSERT INTO "client_visit_entries" (
    "id", "client_id", "appointment_id", "delta", "reason", "created_by_user_id", "created_at"
)
SELECT
    "id", "client_id", "id", 1, 'APPOINTMENT_COMPLETED', "technician_id", COALESCE("completed_at", "updated_at")
FROM "appointments"
WHERE "status" = 'COMPLETED' AND "client_id" IS NOT NULL
ON CONFLICT ("appointment_id") DO NOTHING;
