-- CreateEnum
CREATE TYPE "SellerStatus" AS ENUM ('ONBOARDING', 'ACTIVE');

-- CreateEnum
CREATE TYPE "FulfilmentOption" AS ENUM ('DELIVERY', 'COLLECTION', 'ONLINE');

-- CreateEnum
CREATE TYPE "Province" AS ENUM ('EASTERN_CAPE', 'FREE_STATE', 'GAUTENG', 'KWAZULU_NATAL', 'LIMPOPO', 'MPUMALANGA', 'NORTH_WEST', 'NORTHERN_CAPE', 'WESTERN_CAPE');

-- AlterTable
ALTER TABLE "sellers" ADD COLUMN     "facebook_url" TEXT,
ADD COLUMN     "fulfilment" "FulfilmentOption"[] DEFAULT ARRAY[]::"FulfilmentOption"[],
ADD COLUMN     "instagram_url" TEXT,
ADD COLUMN     "logo_url" TEXT,
ADD COLUMN     "onboarded_at" TIMESTAMP(3),
ADD COLUMN     "province" "Province",
ADD COLUMN     "service_area" TEXT,
ADD COLUMN     "status" "SellerStatus" NOT NULL DEFAULT 'ONBOARDING',
ADD COLUMN     "tiktok_url" TEXT,
ADD COLUMN     "website_url" TEXT;

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seller_categories" (
    "seller_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seller_categories_pkey" PRIMARY KEY ("seller_id","category_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE INDEX "seller_categories_category_id_idx" ON "seller_categories"("category_id");

-- AddForeignKey
ALTER TABLE "seller_categories" ADD CONSTRAINT "seller_categories_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "seller_categories" ADD CONSTRAINT "seller_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Seed the initial category list. These are data, not code: rename,
-- reorder or deactivate them (is_active = false) without a deploy.
-- ON CONFLICT keeps this safe if a category was already added by hand.
INSERT INTO "categories" ("id", "slug", "name", "description", "sort_order", "updated_at") VALUES
  (gen_random_uuid()::text, 'hair-wigs-weaves',        'Hair, wigs & weaves',            'Weaves, wigs, extensions, braiding and hair care',      10,  CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'clothing-shoes-accessories','Clothing, shoes & accessories', 'Fashion, footwear, bags and accessories',               20,  CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'beauty-personal-care',    'Beauty & personal care',          'Nails, lashes, make-up services and grooming',          30,  CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'skincare',                'Skincare',                        'Skincare products and treatments',                      40,  CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'cosmetics',               'Cosmetics',                       'Make-up and cosmetic products',                         50,  CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'food-baking-catering',    'Food, baking & catering',         'Home-made food, cakes, baking and catering',            60,  CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'jewellery',               'Jewellery',                       'Jewellery and watches',                                 70,  CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'electronics',             'Electronics',                     'Phones, accessories and gadgets',                       80,  CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'household',               'Household products',              'Cleaning, kitchen and home goods',                      90,  CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'perfumes',                'Perfumes & fragrances',           'Perfumes, colognes and body sprays',                    100, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'furniture',               'Furniture',                       'Furniture and home décor',                              110, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'gifts-custom',            'Gifts & custom products',         'Gift hampers, personalised and hand-made items',        120, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'services',                'Professional & personal services','Services such as tutoring, cleaning, photography, repairs', 130, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'other',                   'Other',                           'Other legitimate products and services',                1000, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;
