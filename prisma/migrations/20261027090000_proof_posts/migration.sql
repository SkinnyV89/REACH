-- Step 2: Proof Posts. Additive only: new tables, new enum values and
-- nullable columns. Existing photos are all GALLERY uploads, which is the
-- default for the new capture_source column.

-- CreateEnum
CREATE TYPE "CaptureSource" AS ENUM ('GALLERY', 'IN_APP_CAMERA');

-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'HIDDEN', 'REMOVED');

-- AlterEnum
ALTER TYPE "EventTarget" ADD VALUE 'POST';

-- AlterEnum
ALTER TYPE "LeadSource" ADD VALUE 'POST';

-- AlterEnum
ALTER TYPE "MediaKind" ADD VALUE 'POST';

-- AlterTable
ALTER TABLE "attribution_events" ADD COLUMN     "post_id" TEXT;

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "post_id" TEXT;

-- AlterTable
ALTER TABLE "media" ADD COLUMN     "capture_source" "CaptureSource" NOT NULL DEFAULT 'GALLERY',
ADD COLUMN     "captured_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "posts" (
    "id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "caption" TEXT NOT NULL,
    "status" "PostStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_media" (
    "post_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "post_media_pkey" PRIMARY KEY ("post_id","media_id")
);

-- CreateTable
CREATE TABLE "post_products" (
    "post_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,

    CONSTRAINT "post_products_pkey" PRIMARY KEY ("post_id","product_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "posts_code_key" ON "posts"("code");

-- CreateIndex
CREATE INDEX "posts_seller_id_status_published_at_idx" ON "posts"("seller_id", "status", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "post_media_media_id_key" ON "post_media"("media_id");

-- CreateIndex
CREATE UNIQUE INDEX "post_media_post_id_position_key" ON "post_media"("post_id", "position");

-- CreateIndex
CREATE INDEX "post_products_product_id_idx" ON "post_products"("product_id");

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_products" ADD CONSTRAINT "post_products_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_products" ADD CONSTRAINT "post_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attribution_events" ADD CONSTRAINT "attribution_events_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- At most six photos (or clips) per post, enforced by the database.
ALTER TABLE "post_media" ADD CONSTRAINT "post_media_position_check" CHECK ("position" >= 0 AND "position" < 6);

-- Captions are at most 1,000 characters.
ALTER TABLE "posts" ADD CONSTRAINT "posts_caption_length_check" CHECK (char_length("caption") <= 1000);

-- A capture time is only recorded by REACH's own camera.
ALTER TABLE "media" ADD CONSTRAINT "media_captured_at_check" CHECK ("captured_at" IS NULL OR "capture_source" = 'IN_APP_CAMERA');
