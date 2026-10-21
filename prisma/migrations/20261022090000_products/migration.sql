-- Safety guard: this migration replaces products.category (free text) with a
-- category_id foreign key and changes products.status to an enum. No code has
-- ever written to "products", so the table is expected to be empty. If it is
-- not, stop here rather than lose data; migrate the rows by hand first.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "products") THEN
    RAISE EXCEPTION 'products table is not empty; aborting migration to avoid data loss';
  END IF;
END $$;

-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('PRODUCT', 'SERVICE');

-- CreateEnum
CREATE TYPE "PriceType" AS ENUM ('FIXED', 'FROM', 'ON_REQUEST');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'ARCHIVED');

-- DropForeignKey
ALTER TABLE "products" DROP CONSTRAINT "products_seller_id_fkey";

-- AlterTable
ALTER TABLE "products" DROP COLUMN "category",
ADD COLUMN     "category_id" TEXT NOT NULL,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'ZAR',
ADD COLUMN     "kind" "ProductKind" NOT NULL DEFAULT 'PRODUCT',
ADD COLUMN     "price_type" "PriceType" NOT NULL DEFAULT 'FIXED',
DROP COLUMN "status",
ADD COLUMN     "status" "ProductStatus" NOT NULL DEFAULT 'AVAILABLE';

-- CreateIndex
CREATE INDEX "products_seller_id_status_idx" ON "products"("seller_id", "status");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_campaigns" ADD CONSTRAINT "seller_campaigns_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

