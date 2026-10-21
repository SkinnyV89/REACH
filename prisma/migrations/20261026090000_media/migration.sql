-- Step 1b: photos (logos, cover photos, up to six photos per item).
-- Additive only: two new tables and two nullable columns on sellers.

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('LOGO', 'COVER', 'PRODUCT');

-- AlterTable
ALTER TABLE "sellers" ADD COLUMN     "cover_media_id" TEXT,
ADD COLUMN     "logo_media_id" TEXT;

-- CreateTable
CREATE TABLE "media" (
    "id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "storage_keys" TEXT[],
    "url" TEXT NOT NULL,
    "thumb_url" TEXT NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "bytes" INTEGER NOT NULL,
    "alt_text" TEXT,
    "people_consent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_media" (
    "product_id" TEXT NOT NULL,
    "media_id" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "product_media_pkey" PRIMARY KEY ("product_id","media_id")
);

-- CreateIndex
CREATE INDEX "media_seller_id_kind_idx" ON "media"("seller_id", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "product_media_media_id_key" ON "product_media"("media_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_media_product_id_position_key" ON "product_media"("product_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "sellers_logo_media_id_key" ON "sellers"("logo_media_id");

-- CreateIndex
CREATE UNIQUE INDEX "sellers_cover_media_id_key" ON "sellers"("cover_media_id");

-- AddForeignKey
ALTER TABLE "sellers" ADD CONSTRAINT "sellers_logo_media_id_fkey" FOREIGN KEY ("logo_media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sellers" ADD CONSTRAINT "sellers_cover_media_id_fkey" FOREIGN KEY ("cover_media_id") REFERENCES "media"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_media_id_fkey" FOREIGN KEY ("media_id") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- At most six photos per item, enforced by the database: positions 0-5
-- only, and each position used once per item (unique index above).
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_position_check" CHECK ("position" >= 0 AND "position" < 6);
