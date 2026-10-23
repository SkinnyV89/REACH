-- Step 4: Explore and search. Additive only.

-- Trigram matching for search (typo-tolerant, language-neutral). Available on
-- Neon and standard Postgres.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- AlterEnum
ALTER TYPE "LeadChannel" ADD VALUE 'REACH';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "place_id" TEXT;

-- CreateIndex
CREATE INDEX "products_name_trgm_idx" ON "products" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "sellers_business_name_trgm_idx" ON "sellers" USING GIN ("business_name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "sellers_tagline_trgm_idx" ON "sellers" USING GIN ("tagline" gin_trgm_ops);

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

