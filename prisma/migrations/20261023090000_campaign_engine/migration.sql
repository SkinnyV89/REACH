-- Safety guard: this migration reshapes master_campaigns, seller_campaigns and
-- ai_jobs (free-text columns become typed fields and enums). No code has ever
-- written to these tables, so they are expected to be empty. If any has rows,
-- stop here rather than lose data.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "master_campaigns")
     OR EXISTS (SELECT 1 FROM "seller_campaigns")
     OR EXISTS (SELECT 1 FROM "ai_jobs") THEN
    RAISE EXCEPTION 'campaign tables are not empty; aborting migration to avoid data loss';
  END IF;
END $$;

-- CreateEnum
CREATE TYPE "CampaignSource" AS ENUM ('AI', 'TEMPLATE');

-- CreateEnum
CREATE TYPE "MasterCampaignStatus" AS ENUM ('PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SellerCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "AIJobType" AS ENUM ('CAMPAIGN_GENERATION');

-- CreateEnum
CREATE TYPE "AIJobStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- DropForeignKey
ALTER TABLE "seller_campaigns" DROP CONSTRAINT "seller_campaigns_seller_id_fkey";

-- AlterTable
ALTER TABLE "ai_jobs" DROP COLUMN "tokens_used",
ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "error" TEXT,
ADD COLUMN     "finished_at" TIMESTAMP(3),
ADD COLUMN     "input_tokens" INTEGER,
ADD COLUMN     "model" TEXT,
ADD COLUMN     "output_tokens" INTEGER,
ADD COLUMN     "provider" TEXT NOT NULL,
DROP COLUMN "task_type",
ADD COLUMN     "task_type" "AIJobType" NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "AIJobStatus" NOT NULL DEFAULT 'RUNNING';

-- AlterTable
ALTER TABLE "master_campaigns" DROP COLUMN "base_copy",
DROP COLUMN "category",
ADD COLUMN     "ai_job_id" TEXT,
ADD COLUMN     "body" TEXT NOT NULL,
ADD COLUMN     "call_to_action" TEXT NOT NULL,
ADD COLUMN     "category_id" TEXT NOT NULL,
ADD COLUMN     "headline" TEXT NOT NULL,
ADD COLUMN     "model" TEXT,
ADD COLUMN     "source" "CampaignSource" NOT NULL,
ADD COLUMN     "status" "MasterCampaignStatus" NOT NULL DEFAULT 'PUBLISHED';

-- AlterTable
ALTER TABLE "seller_campaigns" DROP COLUMN "custom_copy",
ADD COLUMN     "body" TEXT NOT NULL,
ADD COLUMN     "call_to_action" TEXT NOT NULL,
ADD COLUMN     "headline" TEXT NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" "SellerCampaignStatus" NOT NULL DEFAULT 'DRAFT';

-- CreateIndex
CREATE INDEX "ai_jobs_created_at_idx" ON "ai_jobs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "master_campaigns_ai_job_id_key" ON "master_campaigns"("ai_job_id");

-- CreateIndex
CREATE INDEX "master_campaigns_category_id_status_idx" ON "master_campaigns"("category_id", "status");

-- CreateIndex
CREATE INDEX "seller_campaigns_seller_id_status_idx" ON "seller_campaigns"("seller_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "seller_campaigns_seller_id_master_campaign_id_key" ON "seller_campaigns"("seller_id", "master_campaign_id");

-- AddForeignKey
ALTER TABLE "master_campaigns" ADD CONSTRAINT "master_campaigns_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "master_campaigns" ADD CONSTRAINT "master_campaigns_ai_job_id_fkey" FOREIGN KEY ("ai_job_id") REFERENCES "ai_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_campaigns" ADD CONSTRAINT "seller_campaigns_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

