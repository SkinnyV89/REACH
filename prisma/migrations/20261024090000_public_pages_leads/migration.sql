-- Safety guard: this migration makes leads.name required, adds required
-- consent and source columns, and changes attribution_events.event_type to
-- an enum. No code has ever written to these tables, so they are expected to
-- be empty. If either has rows, stop here rather than lose or corrupt data.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "leads") OR EXISTS (SELECT 1 FROM "attribution_events") THEN
    RAISE EXCEPTION 'leads or attribution_events is not empty; aborting migration to avoid data loss';
  END IF;
END $$;

-- CreateEnum
CREATE TYPE "LeadChannel" AS ENUM ('WHATSAPP', 'FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('CAMPAIGN_PAGE');

-- CreateEnum
CREATE TYPE "AttributionEventType" AS ENUM ('VIEW', 'WHATSAPP_CLICK');

-- DropForeignKey
ALTER TABLE "attribution_events" DROP CONSTRAINT "attribution_events_seller_id_fkey";

-- DropForeignKey
ALTER TABLE "leads" DROP CONSTRAINT "leads_seller_id_fkey";

-- AlterTable
ALTER TABLE "attribution_events" ADD COLUMN     "channel" "LeadChannel" NOT NULL DEFAULT 'UNKNOWN',
DROP COLUMN "event_type",
ADD COLUMN     "event_type" "AttributionEventType" NOT NULL;

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "channel" "LeadChannel" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "consent_at" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "source" "LeadSource" NOT NULL,
ADD COLUMN     "utm_source" TEXT,
ALTER COLUMN "name" SET NOT NULL;

-- CreateTable
CREATE TABLE "public_rate_limits" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_rate_limits_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "attribution_events_seller_campaign_id_event_type_occurred_a_idx" ON "attribution_events"("seller_campaign_id", "event_type", "occurred_at");

-- CreateIndex
CREATE INDEX "leads_seller_id_status_created_at_idx" ON "leads"("seller_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "leads_seller_campaign_id_contact_created_at_idx" ON "leads"("seller_campaign_id", "contact", "created_at");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attribution_events" ADD CONSTRAINT "attribution_events_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

