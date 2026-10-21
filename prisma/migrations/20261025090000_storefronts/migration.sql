-- CreateEnum
CREATE TYPE "StorefrontLayout" AS ENUM ('PORTFOLIO', 'PRODUCT_GRID', 'MENU');

-- CreateEnum
CREATE TYPE "Availability" AS ENUM ('IN_STOCK', 'PRE_ORDER', 'MADE_TO_ORDER', 'OUT_OF_STOCK', 'BY_BOOKING');

-- CreateEnum
CREATE TYPE "CampaignDestination" AS ENUM ('CAMPAIGN_PAGE', 'STOREFRONT');

-- CreateEnum
CREATE TYPE "EventTarget" AS ENUM ('CAMPAIGN', 'STOREFRONT', 'PRODUCT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LeadSource" ADD VALUE 'STOREFRONT';
ALTER TYPE "LeadSource" ADD VALUE 'PRODUCT';

-- AlterTable
ALTER TABLE "attribution_events" ADD COLUMN     "product_id" TEXT,
ADD COLUMN     "target" "EventTarget" NOT NULL DEFAULT 'CAMPAIGN';

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "product_id" TEXT;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "availability" "Availability" NOT NULL DEFAULT 'IN_STOCK',
ADD COLUMN     "availability_updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "lead_time_days" INTEGER,
ADD COLUMN     "slug" TEXT;

-- AlterTable
ALTER TABLE "seller_campaigns" ADD COLUMN     "destination" "CampaignDestination" NOT NULL DEFAULT 'CAMPAIGN_PAGE';

-- AlterTable
ALTER TABLE "sellers" ADD COLUMN     "area_detail" TEXT,
ADD COLUMN     "layout" "StorefrontLayout" NOT NULL DEFAULT 'PRODUCT_GRID',
ADD COLUMN     "place_id" TEXT,
ADD COLUMN     "service_radius_km" INTEGER,
ADD COLUMN     "storefront_published_at" TIMESTAMP(3),
ADD COLUMN     "tagline" TEXT;

-- CreateTable
CREATE TABLE "places" (
    "id" TEXT NOT NULL,
    "geoname_id" INTEGER NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "province" "Province" NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "population" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_slug_redirects" (
    "seller_id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_slug_redirects_pkey" PRIMARY KEY ("seller_id","slug")
);

-- CreateIndex
CREATE UNIQUE INDEX "places_geoname_id_key" ON "places"("geoname_id");

-- CreateIndex
CREATE UNIQUE INDEX "places_slug_key" ON "places"("slug");

-- CreateIndex
CREATE INDEX "places_province_name_idx" ON "places"("province", "name");

-- CreateIndex
CREATE INDEX "product_slug_redirects_product_id_idx" ON "product_slug_redirects"("product_id");

-- CreateIndex
CREATE INDEX "attribution_events_seller_id_target_event_type_occurred_at_idx" ON "attribution_events"("seller_id", "target", "event_type", "occurred_at");

-- CreateIndex
CREATE INDEX "leads_seller_id_contact_created_at_idx" ON "leads"("seller_id", "contact", "created_at");


-- CreateIndex
CREATE INDEX "sellers_storefront_published_at_idx" ON "sellers"("storefront_published_at");

-- AddForeignKey
ALTER TABLE "sellers" ADD CONSTRAINT "sellers_place_id_fkey" FOREIGN KEY ("place_id") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_slug_redirects" ADD CONSTRAINT "product_slug_redirects_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_slug_redirects" ADD CONSTRAINT "product_slug_redirects_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attribution_events" ADD CONSTRAINT "attribution_events_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Backfill existing data (nothing is deleted or overwritten)
-- ---------------------------------------------------------------------------

-- Product slugs from names: lowercase, common accents removed, other
-- non-alphanumerics to "-", trimmed,
-- 60 chars max, "item" if nothing is left; numbered when a seller has two
-- items with the same name.
WITH base AS (
  SELECT
    id,
    seller_id,
    COALESCE(
      NULLIF(left(trim(both '-' from regexp_replace(
        translate(lower(name), 'áàâäãåçéèêëíìîïñóòôöõúùûüýÿ', 'aaaaaaceeeeiiiinooooouuuuyy'),
        '[^a-z0-9]+', '-', 'g')), 60), ''),
      'item'
    ) AS slug,
    created_at
  FROM "products"
),
numbered AS (
  SELECT id, slug, row_number() OVER (PARTITION BY seller_id, slug ORDER BY created_at, id) AS n FROM base
)
UPDATE "products" p
SET "slug" = CASE WHEN numbered.n = 1 THEN numbered.slug ELSE numbered.slug || '-' || numbered.n END
FROM numbered
WHERE p.id = numbered.id;

ALTER TABLE "products" ALTER COLUMN "slug" SET NOT NULL;
CREATE UNIQUE INDEX "products_seller_id_slug_key" ON "products"("seller_id", "slug");

-- Availability from the old status: unavailable -> out of stock; available
-- services -> by booking; available or archived products -> in stock
-- (archived items stay hidden via status).
UPDATE "products" SET "availability" = CASE
  WHEN "status" = 'UNAVAILABLE' THEN 'OUT_OF_STOCK'::"Availability"
  WHEN "kind" = 'SERVICE' THEN 'BY_BOOKING'::"Availability"
  ELSE 'IN_STOCK'::"Availability"
END,
"availability_updated_at" = "updated_at";

-- Storefront layout from the seller's categories: food -> menu; hair,
-- beauty and services -> portfolio; everything else keeps the product grid.
UPDATE "sellers" s SET "layout" = 'MENU'
WHERE EXISTS (SELECT 1 FROM "seller_categories" sc JOIN "categories" c ON c.id = sc.category_id
              WHERE sc.seller_id = s.id AND c.slug = 'food-baking-catering');
UPDATE "sellers" s SET "layout" = 'PORTFOLIO'
WHERE "layout" = 'PRODUCT_GRID' AND EXISTS (
  SELECT 1 FROM "seller_categories" sc JOIN "categories" c ON c.id = sc.category_id
  WHERE sc.seller_id = s.id AND c.slug IN ('hair-wigs-weaves', 'beauty-personal-care', 'services', 'barbers-mens-grooming'));

-- Storefronts start unpublished: existing sellers opt in (storefront_published_at stays NULL).

-- ---------------------------------------------------------------------------
-- Seed data
-- ---------------------------------------------------------------------------

-- Launch category: barbers.
INSERT INTO "categories" ("id", "slug", "name", "description", "sort_order", "updated_at") VALUES
  (gen_random_uuid()::text, 'barbers-mens-grooming', 'Barbers & men''s grooming', 'Haircuts, fades, beard trims and grooming', 15, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

-- South African towns and cities (population >= 1000) from GeoNames
-- (https://www.geonames.org, CC BY 4.0), via the all-the-cities 3.1.0 dataset.
-- Coordinates are approximate town centres, used only for distance; they are
-- never a seller's address. ON CONFLICT keeps this re-runnable.
INSERT INTO "places" ("id", "geoname_id", "slug", "name", "province", "latitude", "longitude", "population") VALUES
  (gen_random_uuid()::text, 936374, 'roodepoort-gauteng', 'Roodepoort', 'GAUTENG', -26.1625, 27.8725, 225000),
  (gen_random_uuid()::text, 936953, 'zoar-western-cape', 'Zoar', 'WESTERN_CAPE', -33.4956, 21.44373, 4659),
  (gen_random_uuid()::text, 937136, 'zeerust-north-west', 'Zeerust', 'NORTH_WEST', -25.53695, 26.07512, 17708),
  (gen_random_uuid()::text, 937246, 'zastron-free-state', 'Zastron', 'FREE_STATE', -30.30225, 27.08395, 12449),
  (gen_random_uuid()::text, 938457, 'wolmaransstad-north-west', 'Wolmaransstad', 'NORTH_WEST', -27.1974, 25.98311, 49366),
  (gen_random_uuid()::text, 938694, 'white-river-mpumalanga', 'White River', 'MPUMALANGA', -25.33177, 31.01166, 15954),
  (gen_random_uuid()::text, 939270, 'witbank-mpumalanga', 'Witbank', 'MPUMALANGA', -25.87133, 29.23323, 262491),
  (gen_random_uuid()::text, 939608, 'winburg-free-state', 'Winburg', 'FREE_STATE', -28.51805, 27.00933, 11072),
  (gen_random_uuid()::text, 939676, 'willowmore-eastern-cape', 'Willowmore', 'EASTERN_CAPE', -33.29265, 23.48954, 7100),
  (gen_random_uuid()::text, 939702, 'williston-northern-cape', 'Williston', 'NORTHERN_CAPE', -31.34048, 20.91544, 0),
  (gen_random_uuid()::text, 940186, 'whittlesea-eastern-cape', 'Whittlesea', 'EASTERN_CAPE', -32.17588, 26.82437, 12080),
  (gen_random_uuid()::text, 940316, 'westonaria-gauteng', 'Westonaria', 'GAUTENG', -26.31905, 27.6486, 156831),
  (gen_random_uuid()::text, 940424, 'wesselsbron-free-state', 'Wesselsbron', 'FREE_STATE', -27.8549, 26.36583, 42552),
  (gen_random_uuid()::text, 940909, 'welkom-free-state', 'Welkom', 'FREE_STATE', -27.97742, 26.73506, 431944),
  (gen_random_uuid()::text, 941923, 'wartburg-kwazulu-natal', 'Wartburg', 'KWAZULU_NATAL', -29.43184, 30.57567, 0),
  (gen_random_uuid()::text, 941931, 'warrenton-northern-cape', 'Warrenton', 'NORTHERN_CAPE', -28.11396, 24.84753, 17946),
  (gen_random_uuid()::text, 941966, 'warmbaths-limpopo', 'Warmbaths', 'LIMPOPO', -24.88333, 28.28333, 90210),
  (gen_random_uuid()::text, 942206, 'arniston-western-cape', 'Arniston', 'WESTERN_CAPE', -34.66739, 20.23086, 1267),
  (gen_random_uuid()::text, 942470, 'vryheid-kwazulu-natal', 'Vryheid', 'KWAZULU_NATAL', -27.76952, 30.79165, 150012),
  (gen_random_uuid()::text, 942511, 'vryburg-north-west', 'Vryburg', 'NORTH_WEST', -26.95659, 24.7284, 49588),
  (gen_random_uuid()::text, 942683, 'vredefort-free-state', 'Vredefort', 'FREE_STATE', -27.00805, 27.3646, 10649),
  (gen_random_uuid()::text, 942701, 'vrede-free-state', 'Vrede', 'FREE_STATE', -27.42573, 29.16585, 14622),
  (gen_random_uuid()::text, 943032, 'volksrust-mpumalanga', 'Volksrust', 'MPUMALANGA', -27.36541, 29.88175, 43378),
  (gen_random_uuid()::text, 943882, 'virginia-free-state', 'Virginia', 'FREE_STATE', -28.10391, 26.86593, 122502),
  (gen_random_uuid()::text, 943937, 'villiers-free-state', 'Villiers', 'FREE_STATE', -27.03026, 28.60061, 11240),
  (gen_random_uuid()::text, 943960, 'viljoenskroon-free-state', 'Viljoenskroon', 'FREE_STATE', -27.20841, 26.94855, 54955),
  (gen_random_uuid()::text, 944024, 'victoria-west-northern-cape', 'Victoria West', 'NORTHERN_CAPE', -31.40364, 23.11461, 0),
  (gen_random_uuid()::text, 944385, 'vereeniging-gauteng', 'Vereeniging', 'GAUTENG', -26.67313, 27.92615, 474681),
  (gen_random_uuid()::text, 944531, 'ventersdorp-north-west', 'Ventersdorp', 'NORTH_WEST', -26.31401, 26.82223, 0),
  (gen_random_uuid()::text, 944540, 'ventersburg-free-state', 'Ventersburg', 'FREE_STATE', -28.08561, 27.13814, 10698),
  (gen_random_uuid()::text, 944774, 'van-wyksvlei-northern-cape', 'Van Wyksvlei', 'NORTHERN_CAPE', -30.35101, 21.82498, 1721),
  (gen_random_uuid()::text, 944986, 'vanderbijlpark-gauteng', 'Vanderbijlpark', 'GAUTENG', -26.71171, 27.83795, 246754),
  (gen_random_uuid()::text, 945813, 'utrecht-kwazulu-natal', 'Utrecht', 'KWAZULU_NATAL', -27.65862, 30.32166, 3575),
  (gen_random_uuid()::text, 945945, 'upington-northern-cape', 'Upington', 'NORTHERN_CAPE', -28.44776, 21.25612, 71373),
  (gen_random_uuid()::text, 946058, 'mthatha-eastern-cape', 'Mthatha', 'EASTERN_CAPE', -31.58893, 28.78443, 78663),
  (gen_random_uuid()::text, 946128, 'emkhomazi-kwazulu-natal', 'eMkhomazi', 'KWAZULU_NATAL', -30.20674, 30.79776, 20410),
  (gen_random_uuid()::text, 946257, 'ulundi-kwazulu-natal', 'Ulundi', 'KWAZULU_NATAL', -28.33523, 31.41617, 20753),
  (gen_random_uuid()::text, 946877, 'uitenhage-eastern-cape', 'Uitenhage', 'EASTERN_CAPE', -33.75757, 25.3971, 228912),
  (gen_random_uuid()::text, 946973, 'tzaneen-limpopo', 'Tzaneen', 'LIMPOPO', -23.83322, 30.16351, 16954),
  (gen_random_uuid()::text, 947666, 'tugela-ferry-kwazulu-natal', 'Tugela Ferry', 'KWAZULU_NATAL', -28.74649, 30.45126, 0),
  (gen_random_uuid()::text, 948099, 'trompsburg-free-state', 'Trompsburg', 'FREE_STATE', -30.03363, 25.78041, 0),
  (gen_random_uuid()::text, 949026, 'thulamahashi-limpopo', 'Thulamahashi', 'LIMPOPO', -24.72459, 31.19939, 11655),
  (gen_random_uuid()::text, 949224, 'thohoyandou-limpopo', 'Thohoyandou', 'LIMPOPO', -22.94564, 30.48497, 44046),
  (gen_random_uuid()::text, 949282, 'theunissen-free-state', 'Theunissen', 'FREE_STATE', -28.41098, 26.70107, 34718),
  (gen_random_uuid()::text, 949683, 'thabazimbi-limpopo', 'Thabazimbi', 'LIMPOPO', -24.59165, 27.41155, 10365),
  (gen_random_uuid()::text, 949703, 'thaba-nchu-free-state', 'Thaba Nchu', 'FREE_STATE', -29.20932, 26.83898, 38616),
  (gen_random_uuid()::text, 949880, 'tembisa-gauteng', 'Tembisa', 'GAUTENG', -25.99636, 28.2268, 511655),
  (gen_random_uuid()::text, 950002, 'taung-north-west', 'Taung', 'NORTH_WEST', -27.53113, 24.78659, 0),
  (gen_random_uuid()::text, 950037, 'tarkastad-eastern-cape', 'Tarkastad', 'EASTERN_CAPE', -32.00893, 26.25935, 0),
  (gen_random_uuid()::text, 950709, 'swellendam-western-cape', 'Swellendam', 'WESTERN_CAPE', -34.02262, 20.44171, 13674),
  (gen_random_uuid()::text, 951441, 'sundumbili-kwazulu-natal', 'Sundumbili', 'KWAZULU_NATAL', -29.13371, 31.39752, 12455),
  (gen_random_uuid()::text, 951650, 'stutterheim-eastern-cape', 'Stutterheim', 'EASTERN_CAPE', -32.57076, 27.42396, 35510),
  (gen_random_uuid()::text, 952192, 'stilfontein-north-west', 'Stilfontein', 'NORTH_WEST', -26.84493, 26.76829, 93110),
  (gen_random_uuid()::text, 952734, 'kwadukuza-kwazulu-natal', 'KwaDukuza', 'KWAZULU_NATAL', -29.32816, 31.28954, 59899),
  (gen_random_uuid()::text, 952747, 'standerton-mpumalanga', 'Standerton', 'MPUMALANGA', -26.93366, 29.24152, 74021),
  (gen_random_uuid()::text, 952865, 'springs-gauteng', 'Springs', 'GAUTENG', -26.25, 28.4, 186394),
  (gen_random_uuid()::text, 953781, 'soweto-gauteng', 'Soweto', 'GAUTENG', -26.26781, 27.85849, 1695047),
  (gen_random_uuid()::text, 954161, 'somerset-east-eastern-cape', 'Somerset East', 'EASTERN_CAPE', -32.72173, 25.58804, 16155),
  (gen_random_uuid()::text, 955313, 'siyabuswa-mpumalanga', 'Siyabuswa', 'MPUMALANGA', -25.11319, 29.04454, 26236),
  (gen_random_uuid()::text, 956507, 'senekal-free-state', 'Senekal', 'FREE_STATE', -28.31971, 27.62082, 39584),
  (gen_random_uuid()::text, 956767, 'secunda-mpumalanga', 'Secunda', 'MPUMALANGA', -26.55, 29.16667, 20418),
  (gen_random_uuid()::text, 956878, 'scottburgh-kwazulu-natal', 'Scottburgh', 'KWAZULU_NATAL', -30.28666, 30.75316, 23949),
  (gen_random_uuid()::text, 956907, 'schweizer-reneke-north-west', 'Schweizer-Reneke', 'NORTH_WEST', -27.18871, 25.32931, 70214),
  (gen_random_uuid()::text, 957487, 'sasolburg-free-state', 'Sasolburg', 'FREE_STATE', -26.81358, 27.81695, 77016),
  (gen_random_uuid()::text, 958273, 'saint-lucia-estuary-kwazulu-natal', 'Saint Lucia Estuary', 'KWAZULU_NATAL', -28.37622, 32.41181, 1104),
  (gen_random_uuid()::text, 958724, 'rustenburg-north-west', 'Rustenburg', 'NORTH_WEST', -25.66756, 27.24208, 124064),
  (gen_random_uuid()::text, 961152, 'riversdale-western-cape', 'Riversdale', 'WESTERN_CAPE', -34.09345, 21.25725, 16176),
  (gen_random_uuid()::text, 961226, 'ritchie-northern-cape', 'Ritchie', 'NORTHERN_CAPE', -29.03801, 24.60278, 9960),
  (gen_random_uuid()::text, 962330, 'richmond-kwazulu-natal', 'Richmond', 'KWAZULU_NATAL', -29.87196, 30.27235, 32445),
  (gen_random_uuid()::text, 962367, 'richards-bay-kwazulu-natal', 'Richards Bay', 'KWAZULU_NATAL', -28.78301, 32.03768, 252968),
  (gen_random_uuid()::text, 962847, 'reitz-free-state', 'Reitz', 'FREE_STATE', -27.80138, 28.42726, 16637),
  (gen_random_uuid()::text, 963230, 'randfontein-gauteng', 'Randfontein', 'GAUTENG', -26.1844, 27.70203, 133654),
  (gen_random_uuid()::text, 963241, 'randburg-gauteng', 'Randburg', 'GAUTENG', -26.0941, 28.00123, 337053),
  (gen_random_uuid()::text, 963488, 'qumbu-eastern-cape', 'Qumbu', 'EASTERN_CAPE', -31.16304, 28.87056, 0),
  (gen_random_uuid()::text, 963516, 'queenstown-eastern-cape', 'Queenstown', 'EASTERN_CAPE', -31.89756, 26.87533, 105309),
  (gen_random_uuid()::text, 963525, 'queensdale-eastern-cape', 'Queensdale', 'EASTERN_CAPE', -31.87101, 26.97862, 20009),
  (gen_random_uuid()::text, 964078, 'prince-albert-western-cape', 'Prince Albert', 'WESTERN_CAPE', -33.22476, 22.02673, 13136),
  (gen_random_uuid()::text, 964090, 'prieska-northern-cape', 'Prieska', 'NORTHERN_CAPE', -29.66803, 22.74251, 11236),
  (gen_random_uuid()::text, 964137, 'pretoria-gauteng', 'Pretoria', 'GAUTENG', -25.74486, 28.18783, 1619438),
  (gen_random_uuid()::text, 964315, 'mokopane-limpopo', 'Mokopane', 'LIMPOPO', -24.19436, 29.00974, 101090),
  (gen_random_uuid()::text, 964349, 'potchefstroom-north-west', 'Potchefstroom', 'NORTH_WEST', -26.71667, 27.1, 123669),
  (gen_random_uuid()::text, 964363, 'postmasburg-northern-cape', 'Postmasburg', 'NORTHERN_CAPE', -28.33392, 23.06541, 30089),
  (gen_random_uuid()::text, 964406, 'port-shepstone-kwazulu-natal', 'Port Shepstone', 'KWAZULU_NATAL', -30.74137, 30.45499, 52793),
  (gen_random_uuid()::text, 964408, 'port-saint-john-s-eastern-cape', 'Port Saint John’s', 'EASTERN_CAPE', -31.62291, 29.54477, 5939),
  (gen_random_uuid()::text, 964420, 'port-elizabeth-eastern-cape', 'Port Elizabeth', 'EASTERN_CAPE', -33.96109, 25.61494, 967677),
  (gen_random_uuid()::text, 964432, 'port-alfred-eastern-cape', 'Port Alfred', 'EASTERN_CAPE', -33.58601, 26.88329, 17959),
  (gen_random_uuid()::text, 964574, 'pongola-kwazulu-natal', 'Pongola', 'KWAZULU_NATAL', -27.37808, 31.61904, 0),
  (gen_random_uuid()::text, 964712, 'plettenberg-bay-western-cape', 'Plettenberg Bay', 'WESTERN_CAPE', -34.05274, 23.3716, 19445),
  (gen_random_uuid()::text, 965241, 'piet-retief-mpumalanga', 'Piet Retief', 'MPUMALANGA', -27.00706, 30.81323, 84349),
  (gen_random_uuid()::text, 965289, 'polokwane-limpopo', 'Polokwane', 'LIMPOPO', -23.90449, 29.46885, 123749),
  (gen_random_uuid()::text, 965301, 'pietermaritzburg-kwazulu-natal', 'Pietermaritzburg', 'KWAZULU_NATAL', -29.61679, 30.39278, 750845),
  (gen_random_uuid()::text, 965401, 'phuthaditjhaba-free-state', 'Phuthaditjhaba', 'FREE_STATE', -28.52423, 28.81582, 84258),
  (gen_random_uuid()::text, 965528, 'phalaborwa-limpopo', 'Phalaborwa', 'LIMPOPO', -23.94299, 31.14107, 109468),
  (gen_random_uuid()::text, 965564, 'petrusville-northern-cape', 'Petrusville', 'NORTHERN_CAPE', -30.08113, 24.6593, 0),
  (gen_random_uuid()::text, 966007, 'peddie-eastern-cape', 'Peddie', 'EASTERN_CAPE', -33.20059, 27.11385, 0),
  (gen_random_uuid()::text, 966060, 'paulpietersburg-kwazulu-natal', 'Paulpietersburg', 'KWAZULU_NATAL', -27.42426, 30.81689, 0),
  (gen_random_uuid()::text, 966166, 'parys-free-state', 'Parys', 'FREE_STATE', -26.9033, 27.45727, 71319),
  (gen_random_uuid()::text, 966380, 'pampierstad-northern-cape', 'Pampierstad', 'NORTHERN_CAPE', -27.78324, 24.68768, 21800),
  (gen_random_uuid()::text, 967106, 'oudtshoorn-western-cape', 'Oudtshoorn', 'WESTERN_CAPE', -33.60047, 22.19955, 61507),
  (gen_random_uuid()::text, 967476, 'orkney-north-west', 'Orkney', 'NORTH_WEST', -26.98023, 26.67272, 145801),
  (gen_random_uuid()::text, 967542, 'orania-northern-cape', 'Orania', 'NORTHERN_CAPE', -29.81381, 24.41205, 1200),
  (gen_random_uuid()::text, 967580, 'orange-farm-gauteng', 'Orange Farm', 'GAUTENG', -26.48333, 27.86667, 10000),
  (gen_random_uuid()::text, 968665, 'modimolle-limpopo', 'Modimolle', 'LIMPOPO', -24.7, 28.4, 20527),
  (gen_random_uuid()::text, 969582, 'noupoort-northern-cape', 'Noupoort', 'NORTHERN_CAPE', -31.18736, 24.94991, 3924),
  (gen_random_uuid()::text, 970133, 'nongoma-kwazulu-natal', 'Nongoma', 'KWAZULU_NATAL', -27.90968, 31.64817, 0),
  (gen_random_uuid()::text, 970341, 'nkowakowa-limpopo', 'Nkowakowa', 'LIMPOPO', -23.88782, 30.28708, 30138),
  (gen_random_uuid()::text, 970480, 'nkandla-kwazulu-natal', 'Nkandla', 'KWAZULU_NATAL', -28.6207, 31.09067, 0),
  (gen_random_uuid()::text, 970566, 'nigel-gauteng', 'Nigel', 'GAUTENG', -26.43138, 28.47713, 140644),
  (gen_random_uuid()::text, 971421, 'newcastle-kwazulu-natal', 'Newcastle', 'KWAZULU_NATAL', -27.75796, 29.9318, 404838),
  (gen_random_uuid()::text, 971534, 'nelspruit-mpumalanga', 'Nelspruit', 'MPUMALANGA', -25.47448, 30.97033, 110159),
  (gen_random_uuid()::text, 971669, 'ndwedwe-kwazulu-natal', 'Ndwedwe', 'KWAZULU_NATAL', -29.51686, 30.92687, 0),
  (gen_random_uuid()::text, 972512, 'mutale-limpopo', 'Mutale', 'LIMPOPO', -22.46972, 30.87533, 0),
  (gen_random_uuid()::text, 972673, 'muldersdriseloop-gauteng', 'Muldersdriseloop', 'GAUTENG', -26.03673, 27.83798, 1500),
  (gen_random_uuid()::text, 972803, 'mtubatuba-kwazulu-natal', 'Mtubatuba', 'KWAZULU_NATAL', -28.41789, 32.18483, 0),
  (gen_random_uuid()::text, 973111, 'mpumalanga-kwazulu-natal', 'Mpumalanga', 'KWAZULU_NATAL', -29.81292, 30.63646, 140121),
  (gen_random_uuid()::text, 973139, 'mpophomeni-kwazulu-natal', 'Mpophomeni', 'KWAZULU_NATAL', -29.56822, 30.18618, 26229),
  (gen_random_uuid()::text, 973525, 'mount-frere-eastern-cape', 'Mount Frere', 'EASTERN_CAPE', -30.90173, 28.99238, 0),
  (gen_random_uuid()::text, 973551, 'mount-ayliff-eastern-cape', 'Mount Ayliff', 'EASTERN_CAPE', -30.80821, 29.36644, 0),
  (gen_random_uuid()::text, 973709, 'mossel-bay-western-cape', 'Mossel Bay', 'WESTERN_CAPE', -34.18307, 22.14605, 59031),
  (gen_random_uuid()::text, 974222, 'mooirivier-kwazulu-natal', 'Mooirivier', 'KWAZULU_NATAL', -29.20824, 29.9946, 10132),
  (gen_random_uuid()::text, 974611, 'montagu-western-cape', 'Montagu', 'WESTERN_CAPE', -33.78664, 20.12106, 15176),
  (gen_random_uuid()::text, 974670, 'mondlo-kwazulu-natal', 'Mondlo', 'KWAZULU_NATAL', -27.98299, 30.71769, 44922),
  (gen_random_uuid()::text, 974719, 'molteno-eastern-cape', 'Molteno', 'EASTERN_CAPE', -31.39675, 26.36246, 10078),
  (gen_random_uuid()::text, 974932, 'mogwase-north-west', 'Mogwase', 'NORTH_WEST', -25.27748, 27.21605, 0),
  (gen_random_uuid()::text, 975144, 'modderfontein-gauteng', 'Modderfontein', 'GAUTENG', -26.08909, 28.16534, 3000),
  (gen_random_uuid()::text, 975436, 'mmabatho-north-west', 'Mmabatho', 'NORTH_WEST', -25.85, 25.63333, 76754),
  (gen_random_uuid()::text, 975511, 'mkuze-kwazulu-natal', 'Mkuze', 'KWAZULU_NATAL', -27.61641, 32.03861, 0),
  (gen_random_uuid()::text, 976358, 'middelburg-eastern-cape', 'Middelburg', 'EASTERN_CAPE', -31.49285, 25.00633, 18164),
  (gen_random_uuid()::text, 976361, 'middelburg-mpumalanga', 'Middelburg', 'MPUMALANGA', -25.77507, 29.46482, 154706),
  (gen_random_uuid()::text, 976764, 'meyerton-gauteng', 'Meyerton', 'GAUTENG', -26.55987, 28.0195, 0),
  (gen_random_uuid()::text, 977135, 'melmoth-kwazulu-natal', 'Melmoth', 'KWAZULU_NATAL', -28.58664, 31.39783, 0),
  (gen_random_uuid()::text, 978327, 'matatiele-kwazulu-natal', 'Matatiele', 'KWAZULU_NATAL', -30.34357, 28.81161, 0),
  (gen_random_uuid()::text, 978677, 'marquard-free-state', 'Marquard', 'FREE_STATE', -28.66449, 27.43048, 10839),
  (gen_random_uuid()::text, 978895, 'margate-kwazulu-natal', 'Margate', 'KWAZULU_NATAL', -30.8636, 30.37052, 34407),
  (gen_random_uuid()::text, 978944, 'marble-hall-mpumalanga', 'Marble Hall', 'MPUMALANGA', -24.96627, 29.29068, 0),
  (gen_random_uuid()::text, 979365, 'mankoeng-limpopo', 'Mankoeng', 'LIMPOPO', -23.9, 29.81667, 12499),
  (gen_random_uuid()::text, 980101, 'makapanstad-north-west', 'Makapanstad', 'NORTH_WEST', -25.24373, 28.1262, 0),
  (gen_random_uuid()::text, 980213, 'maile-north-west', 'Maile', 'NORTH_WEST', -25.44152, 27.28165, 10000),
  (gen_random_uuid()::text, 980595, 'mahikeng-north-west', 'Mahikeng', 'NORTH_WEST', -25.86522, 25.64421, 14000),
  (gen_random_uuid()::text, 980798, 'maclear-eastern-cape', 'Maclear', 'EASTERN_CAPE', -31.07104, 28.35183, 0),
  (gen_random_uuid()::text, 980921, 'mabopane-gauteng', 'Mabopane', 'GAUTENG', -25.49768, 28.10065, 97417),
  (gen_random_uuid()::text, 981158, 'lydenburg-mpumalanga', 'Lydenburg', 'MPUMALANGA', -25.09598, 30.44393, 21695),
  (gen_random_uuid()::text, 981827, 'louis-trichardt-limpopo', 'Louis Trichardt', 'LIMPOPO', -23.04385, 29.90319, 86854),
  (gen_random_uuid()::text, 982701, 'lindley-free-state', 'Lindley', 'FREE_STATE', -27.8791, 27.91348, 12000),
  (gen_random_uuid()::text, 982899, 'lichtenburg-north-west', 'Lichtenburg', 'NORTH_WEST', -26.152, 26.15968, 65863),
  (gen_random_uuid()::text, 982906, 'libode-eastern-cape', 'Libode', 'EASTERN_CAPE', -31.54331, 29.0164, 0),
  (gen_random_uuid()::text, 984087, 'lebowakgomo-limpopo', 'Lebowakgomo', 'LIMPOPO', -24.2, 29.5, 33308),
  (gen_random_uuid()::text, 984962, 'laingsburg-western-cape', 'Laingsburg', 'WESTERN_CAPE', -33.19495, 20.85872, 0),
  (gen_random_uuid()::text, 984998, 'ladysmith-kwazulu-natal', 'Ladysmith', 'KWAZULU_NATAL', -28.55874, 29.77896, 0),
  (gen_random_uuid()::text, 985004, 'lady-grey-eastern-cape', 'Lady Grey', 'EASTERN_CAPE', -30.71084, 27.21613, 0),
  (gen_random_uuid()::text, 985011, 'lady-frere-eastern-cape', 'Lady Frere', 'EASTERN_CAPE', -31.70312, 27.2329, 25041),
  (gen_random_uuid()::text, 985015, 'ladybrand-free-state', 'Ladybrand', 'FREE_STATE', -29.19448, 27.45739, 17228),
  (gen_random_uuid()::text, 985020, 'ladismith-western-cape', 'Ladismith', 'WESTERN_CAPE', -33.49331, 21.26755, 7127),
  (gen_random_uuid()::text, 985609, 'kwambonambi-kwazulu-natal', 'KwaMbonambi', 'KWAZULU_NATAL', -28.59827, 32.0894, 0),
  (gen_random_uuid()::text, 986083, 'kutloanong-free-state', 'Kutloanong', 'FREE_STATE', -27.83333, 26.75, 95008),
  (gen_random_uuid()::text, 986134, 'kuruman-northern-cape', 'Kuruman', 'NORTHERN_CAPE', -27.4524, 23.43246, 9093),
  (gen_random_uuid()::text, 986717, 'kruisfontein-eastern-cape', 'Kruisfontein', 'EASTERN_CAPE', -34.00333, 24.73142, 18991),
  (gen_random_uuid()::text, 986822, 'krugersdorp-gauteng', 'Krugersdorp', 'GAUTENG', -26.08577, 27.77515, 378821),
  (gen_random_uuid()::text, 986846, 'kroonstad-free-state', 'Kroonstad', 'FREE_STATE', -27.65036, 27.23488, 103992),
  (gen_random_uuid()::text, 987202, 'kriel-mpumalanga', 'Kriel', 'MPUMALANGA', -26.27391, 29.2253, 15055),
  (gen_random_uuid()::text, 987648, 'koster-north-west', 'Koster', 'NORTH_WEST', -25.86301, 26.89756, 12126),
  (gen_random_uuid()::text, 987875, 'koppies-free-state', 'Koppies', 'FREE_STATE', -27.24179, 27.57422, 11445),
  (gen_random_uuid()::text, 988265, 'komga-eastern-cape', 'Komga', 'EASTERN_CAPE', -32.57704, 27.892, 0),
  (gen_random_uuid()::text, 988290, 'komatipoort-mpumalanga', 'Komatipoort', 'MPUMALANGA', -25.43321, 31.95478, 20508),
  (gen_random_uuid()::text, 988356, 'kokstad-kwazulu-natal', 'Kokstad', 'KWAZULU_NATAL', -30.54723, 29.42412, 25373),
  (gen_random_uuid()::text, 988429, 'koffiefontein-free-state', 'Koffiefontein', 'FREE_STATE', -29.40661, 25.00309, 0),
  (gen_random_uuid()::text, 988698, 'knysna-western-cape', 'Knysna', 'WESTERN_CAPE', -34.03627, 23.04713, 68659),
  (gen_random_uuid()::text, 989921, 'klerksdorp-north-west', 'Klerksdorp', 'NORTH_WEST', -26.85213, 26.66672, 178921),
  (gen_random_uuid()::text, 990802, 'kirkwood-eastern-cape', 'Kirkwood', 'EASTERN_CAPE', -33.39829, 25.44279, 10148),
  (gen_random_uuid()::text, 990930, 'kimberley-northern-cape', 'Kimberley', 'NORTHERN_CAPE', -28.73226, 24.76232, 142089),
  (gen_random_uuid()::text, 991396, 'kenhardt-northern-cape', 'Kenhardt', 'NORTHERN_CAPE', -29.34574, 21.15786, 4842),
  (gen_random_uuid()::text, 991664, 'kathu-northern-cape', 'Kathu', 'NORTHERN_CAPE', -27.69569, 23.04929, 9219),
  (gen_random_uuid()::text, 992071, 'kareedouw-eastern-cape', 'Kareedouw', 'EASTERN_CAPE', -33.9528, 24.29053, 0),
  (gen_random_uuid()::text, 993014, 'kakamas-northern-cape', 'Kakamas', 'NORTHERN_CAPE', -28.77341, 20.6147, 0),
  (gen_random_uuid()::text, 993568, 'jozini-kwazulu-natal', 'Jozini', 'KWAZULU_NATAL', -27.4296, 32.06658, 0),
  (gen_random_uuid()::text, 993800, 'johannesburg-gauteng', 'Johannesburg', 'GAUTENG', -26.20227, 28.04363, 2026469),
  (gen_random_uuid()::text, 993993, 'jansenville-eastern-cape', 'Jansenville', 'EASTERN_CAPE', -32.94306, 24.67218, 0),
  (gen_random_uuid()::text, 994023, 'jan-kempdorp-north-west', 'Jan Kempdorp', 'NORTH_WEST', -27.92246, 24.83051, 13485),
  (gen_random_uuid()::text, 994037, 'jane-furse-limpopo', 'Jane Furse', 'LIMPOPO', -24.76021, 29.86993, 0),
  (gen_random_uuid()::text, 994408, 'izingolweni-kwazulu-natal', 'Izingolweni', 'KWAZULU_NATAL', -30.78409, 30.12294, 0),
  (gen_random_uuid()::text, 994418, 'ixopo-kwazulu-natal', 'Ixopo', 'KWAZULU_NATAL', -30.15, 30.08333, 0),
  (gen_random_uuid()::text, 994883, 'impendle-kwazulu-natal', 'Impendle', 'KWAZULU_NATAL', -29.60049, 29.86561, 0),
  (gen_random_uuid()::text, 994939, 'ilinge-eastern-cape', 'Ilinge', 'EASTERN_CAPE', -31.97676, 27.04267, 10899),
  (gen_random_uuid()::text, 995202, 'howick-kwazulu-natal', 'Howick', 'KWAZULU_NATAL', -29.47795, 30.23057, 28725),
  (gen_random_uuid()::text, 995508, 'hopetown-northern-cape', 'Hopetown', 'NORTHERN_CAPE', -29.62464, 24.08518, 0),
  (gen_random_uuid()::text, 995573, 'hoopstad-free-state', 'Hoopstad', 'FREE_STATE', -27.83273, 25.90833, 12663),
  (gen_random_uuid()::text, 996195, 'hoedspruit-limpopo', 'Hoedspruit', 'LIMPOPO', -24.35122, 30.95332, 0),
  (gen_random_uuid()::text, 996256, 'hluhluwe-kwazulu-natal', 'Hluhluwe', 'KWAZULU_NATAL', -28.01895, 32.26762, 1500),
  (gen_random_uuid()::text, 996377, 'hlabisa-kwazulu-natal', 'Hlabisa', 'KWAZULU_NATAL', -28.14519, 31.87719, 0),
  (gen_random_uuid()::text, 996409, 'himeville-kwazulu-natal', 'Himeville', 'KWAZULU_NATAL', -29.74675, 29.51361, 0),
  (gen_random_uuid()::text, 996918, 'hennenman-free-state', 'Hennenman', 'FREE_STATE', -27.97654, 27.02423, 22847),
  (gen_random_uuid()::text, 996930, 'hendrina-mpumalanga', 'Hendrina', 'MPUMALANGA', -26.15881, 29.71528, 15871),
  (gen_random_uuid()::text, 997140, 'heilbron-free-state', 'Heilbron', 'FREE_STATE', -27.28115, 27.9709, 55196),
  (gen_random_uuid()::text, 997151, 'heidelberg-gauteng', 'Heidelberg', 'GAUTENG', -26.50476, 28.35921, 64199),
  (gen_random_uuid()::text, 997373, 'hartswater-northern-cape', 'Hartswater', 'NORTHERN_CAPE', -27.74964, 24.79712, 0),
  (gen_random_uuid()::text, 997751, 'harrismith-free-state', 'Harrismith', 'FREE_STATE', -28.27276, 29.12946, 35108),
  (gen_random_uuid()::text, 997861, 'harding-kwazulu-natal', 'Harding', 'KWAZULU_NATAL', -30.57643, 29.88401, 0),
  (gen_random_uuid()::text, 999962, 'groblershoop-northern-cape', 'Groblershoop', 'NORTHERN_CAPE', -28.89531, 21.98378, 0),
  (gen_random_uuid()::text, 999964, 'groblersdal-mpumalanga', 'Groblersdal', 'MPUMALANGA', -25.16843, 29.39412, 0),
  (gen_random_uuid()::text, 1000006, 'greytown-kwazulu-natal', 'Greytown', 'KWAZULU_NATAL', -29.06415, 30.59279, 13912),
  (gen_random_uuid()::text, 1000501, 'grahamstown-eastern-cape', 'Grahamstown', 'EASTERN_CAPE', -33.30422, 26.53276, 91548),
  (gen_random_uuid()::text, 1000543, 'graaff-reinet-eastern-cape', 'Graaff-Reinet', 'EASTERN_CAPE', -32.25215, 24.53075, 62896),
  (gen_random_uuid()::text, 1001736, 'glencoe-kwazulu-natal', 'Glencoe', 'KWAZULU_NATAL', -28.17827, 30.14702, 13547),
  (gen_random_uuid()::text, 1001860, 'giyani-limpopo', 'Giyani', 'LIMPOPO', -23.30246, 30.71868, 37024),
  (gen_random_uuid()::text, 1002108, 'germiston-gauteng', 'Germiston', 'GAUTENG', -26.23481, 28.17665, 0),
  (gen_random_uuid()::text, 1002145, 'george-western-cape', 'George', 'WESTERN_CAPE', -33.963, 22.46173, 12345),
  (gen_random_uuid()::text, 1002851, 'ga-rankuwa-north-west', 'Ga-Rankuwa', 'NORTH_WEST', -25.61692, 27.99471, 68767),
  (gen_random_uuid()::text, 1002917, 'ganyesa-north-west', 'Ganyesa', 'NORTH_WEST', -26.59613, 24.17612, 0),
  (gen_random_uuid()::text, 1003462, 'ga-kgapane-limpopo', 'Ga-Kgapane', 'LIMPOPO', -23.64378, 30.22324, 13000),
  (gen_random_uuid()::text, 1003702, 'fraserburg-northern-cape', 'Fraserburg', 'NORTHERN_CAPE', -31.91566, 21.51335, 3029),
  (gen_random_uuid()::text, 1003763, 'frankfort-free-state', 'Frankfort', 'FREE_STATE', -27.27888, 28.49696, 1900),
  (gen_random_uuid()::text, 1003953, 'fort-beaufort-eastern-cape', 'Fort Beaufort', 'EASTERN_CAPE', -32.77477, 26.63376, 58419),
  (gen_random_uuid()::text, 1004109, 'fochville-north-west', 'Fochville', 'NORTH_WEST', -26.48862, 27.49387, 62416),
  (gen_random_uuid()::text, 1004210, 'flagstaff-eastern-cape', 'Flagstaff', 'EASTERN_CAPE', -31.08042, 29.49522, 0),
  (gen_random_uuid()::text, 1004303, 'ficksburg-free-state', 'Ficksburg', 'FREE_STATE', -28.872, 27.87506, 0),
  (gen_random_uuid()::text, 1004962, 'estcourt-kwazulu-natal', 'Estcourt', 'KWAZULU_NATAL', -29.01269, 29.86619, 0),
  (gen_random_uuid()::text, 1005029, 'esikhaleni-kwazulu-natal', 'eSikhaleni', 'KWAZULU_NATAL', -28.87097, 31.89961, 49265),
  (gen_random_uuid()::text, 1005040, 'eshowe-kwazulu-natal', 'Eshowe', 'KWAZULU_NATAL', -28.88649, 31.4699, 14786),
  (gen_random_uuid()::text, 1005125, 'ermelo-mpumalanga', 'Ermelo', 'MPUMALANGA', -26.53333, 29.98333, 41124),
  (gen_random_uuid()::text, 1005544, 'empangeni-kwazulu-natal', 'Empangeni', 'KWAZULU_NATAL', -28.76197, 31.89329, 28093),
  (gen_random_uuid()::text, 1005646, 'embalenhle-mpumalanga', 'eMbalenhle', 'MPUMALANGA', -26.53333, 29.06667, 141741),
  (gen_random_uuid()::text, 1005781, 'elliot-eastern-cape', 'Elliot', 'EASTERN_CAPE', -31.33333, 27.85, 11836),
  (gen_random_uuid()::text, 1006420, 'ekuvukeni-kwazulu-natal', 'Ekuvukeni', 'KWAZULU_NATAL', -28.46752, 30.15513, 14331),
  (gen_random_uuid()::text, 1006834, 'edenvale-gauteng', 'Edenvale', 'GAUTENG', -26.14095, 28.15247, 49292),
  (gen_random_uuid()::text, 1006984, 'east-london-eastern-cape', 'East London', 'EASTERN_CAPE', -33.01529, 27.91162, 478676),
  (gen_random_uuid()::text, 1007311, 'durban-kwazulu-natal', 'Durban', 'KWAZULU_NATAL', -29.8579, 31.0292, 3120282),
  (gen_random_uuid()::text, 1007400, 'dundee-kwazulu-natal', 'Dundee', 'KWAZULU_NATAL', -28.16678, 30.23371, 84413),
  (gen_random_uuid()::text, 1007514, 'duiwelskloof-limpopo', 'Duiwelskloof', 'LIMPOPO', -23.69339, 30.14002, 24572),
  (gen_random_uuid()::text, 1008261, 'driefontein-mpumalanga', 'Driefontein', 'MPUMALANGA', -27.0177, 30.44979, 28127),
  (gen_random_uuid()::text, 1008612, 'douglas-northern-cape', 'Douglas', 'NORTHERN_CAPE', -29.05531, 23.7743, 0),
  (gen_random_uuid()::text, 1008858, 'dordrecht-eastern-cape', 'Dordrecht', 'EASTERN_CAPE', -31.372, 27.04878, 9123),
  (gen_random_uuid()::text, 1010586, 'dewetsdorp-free-state', 'Dewetsdorp', 'FREE_STATE', -29.58274, 26.66511, 0),
  (gen_random_uuid()::text, 1010728, 'de-rust-western-cape', 'De Rust', 'WESTERN_CAPE', -33.49035, 22.53523, 3566),
  (gen_random_uuid()::text, 1010962, 'deneysville-free-state', 'Deneysville', 'FREE_STATE', -26.8908, 28.09707, 12397),
  (gen_random_uuid()::text, 1010967, 'dendron-limpopo', 'Dendron', 'LIMPOPO', -23.36669, 29.32371, 0),
  (gen_random_uuid()::text, 1011031, 'delmas-mpumalanga', 'Delmas', 'MPUMALANGA', -26.1466, 28.68322, 92046),
  (gen_random_uuid()::text, 1011062, 'delareyville-north-west', 'Delareyville', 'NORTH_WEST', -26.68638, 25.45907, 0),
  (gen_random_uuid()::text, 1011632, 'de-aar-northern-cape', 'De Aar', 'NORTHERN_CAPE', -30.64966, 24.0123, 32318),
  (gen_random_uuid()::text, 1011881, 'dannhauser-kwazulu-natal', 'Dannhauser', 'KWAZULU_NATAL', -28.0151, 30.05658, 0),
  (gen_random_uuid()::text, 1011918, 'danielskuil-northern-cape', 'Daniëlskuil', 'NORTHERN_CAPE', -28.18873, 23.53951, 10123),
  (gen_random_uuid()::text, 1012413, 'cullinan-gauteng', 'Cullinan', 'GAUTENG', -25.67088, 28.52364, 25490),
  (gen_random_uuid()::text, 1012528, 'creighton-kwazulu-natal', 'Creighton', 'KWAZULU_NATAL', -30.0272, 29.83955, 0),
  (gen_random_uuid()::text, 1012600, 'cradock-eastern-cape', 'Cradock', 'EASTERN_CAPE', -32.16422, 25.61918, 32898),
  (gen_random_uuid()::text, 1013076, 'colesberg-northern-cape', 'Colesberg', 'NORTHERN_CAPE', -30.71999, 25.09718, 12423),
  (gen_random_uuid()::text, 1013125, 'cofimvaba-eastern-cape', 'Cofimvaba', 'EASTERN_CAPE', -32.00115, 27.58045, 0),
  (gen_random_uuid()::text, 1013266, 'clocolan-free-state', 'Clocolan', 'FREE_STATE', -28.91367, 27.56555, 12318),
  (gen_random_uuid()::text, 1013550, 'christiana-north-west', 'Christiana', 'NORTH_WEST', -27.91402, 25.16111, 17523),
  (gen_random_uuid()::text, 1014012, 'carolina-mpumalanga', 'Carolina', 'MPUMALANGA', -26.06927, 30.11489, 2952),
  (gen_random_uuid()::text, 1014034, 'carnarvon-northern-cape', 'Carnarvon', 'NORTHERN_CAPE', -30.96827, 22.13303, 5785),
  (gen_random_uuid()::text, 1014073, 'carletonville-gauteng', 'Carletonville', 'GAUTENG', -26.36094, 27.39767, 182304),
  (gen_random_uuid()::text, 1014180, 'camperdown-kwazulu-natal', 'Camperdown', 'KWAZULU_NATAL', -29.72868, 30.54256, 0),
  (gen_random_uuid()::text, 1014257, 'calitzdorp-western-cape', 'Calitzdorp', 'WESTERN_CAPE', -33.52755, 21.6762, 4284),
  (gen_random_uuid()::text, 1014322, 'cala-eastern-cape', 'Cala', 'EASTERN_CAPE', -31.52356, 27.6952, 0),
  (gen_random_uuid()::text, 1014489, 'butterworth-eastern-cape', 'Butterworth', 'EASTERN_CAPE', -32.33083, 28.14981, 34353),
  (gen_random_uuid()::text, 1014650, 'burgersfort-mpumalanga', 'Burgersfort', 'MPUMALANGA', -24.67554, 30.32877, 0),
  (gen_random_uuid()::text, 1014653, 'burgersdorp-eastern-cape', 'Burgersdorp', 'EASTERN_CAPE', -30.99766, 26.32862, 12548),
  (gen_random_uuid()::text, 1014747, 'bultfontein-free-state', 'Bultfontein', 'FREE_STATE', -28.28756, 26.14996, 0),
  (gen_random_uuid()::text, 1015504, 'bronkhorstspruit-gauteng', 'Bronkhorstspruit', 'GAUTENG', -25.81015, 28.74248, 27343),
  (gen_random_uuid()::text, 1015621, 'brits-north-west', 'Brits', 'NORTH_WEST', -25.63473, 27.78022, 122497),
  (gen_random_uuid()::text, 1015694, 'breyten-mpumalanga', 'Breyten', 'MPUMALANGA', -26.30176, 29.98696, 12550),
  (gen_random_uuid()::text, 1015776, 'bredasdorp-western-cape', 'Bredasdorp', 'WESTERN_CAPE', -34.53215, 20.04031, 14936),
  (gen_random_uuid()::text, 1015850, 'brandvlei-northern-cape', 'Brandvlei', 'NORTHERN_CAPE', -30.46532, 20.48659, 2859),
  (gen_random_uuid()::text, 1015969, 'brandfort-free-state', 'Brandfort', 'FREE_STATE', -28.70008, 26.45968, 12091),
  (gen_random_uuid()::text, 1016181, 'brakpan-gauteng', 'Brakpan', 'GAUTENG', -26.23656, 28.36938, 305692),
  (gen_random_uuid()::text, 1016670, 'botshabelo-free-state', 'Botshabelo', 'FREE_STATE', -29.26737, 26.72595, 309714),
  (gen_random_uuid()::text, 1016698, 'bothaville-free-state', 'Bothaville', 'FREE_STATE', -27.3887, 26.61701, 71934),
  (gen_random_uuid()::text, 1017048, 'boshof-free-state', 'Boshof', 'FREE_STATE', -28.53914, 25.23965, 0),
  (gen_random_uuid()::text, 1017780, 'boksburg-gauteng', 'Boksburg', 'GAUTENG', -26.21197, 28.25958, 445168),
  (gen_random_uuid()::text, 1018148, 'bochum-limpopo', 'Bochum', 'LIMPOPO', -23.28609, 29.13964, 12000),
  (gen_random_uuid()::text, 1018673, 'bloemhof-north-west', 'Bloemhof', 'NORTH_WEST', -27.64685, 25.60697, 17122),
  (gen_random_uuid()::text, 1018725, 'bloemfontein-free-state', 'Bloemfontein', 'FREE_STATE', -29.12107, 26.214, 463064),
  (gen_random_uuid()::text, 1019264, 'bizana-eastern-cape', 'Bizana', 'EASTERN_CAPE', -30.85907, 29.85384, 0),
  (gen_random_uuid()::text, 1019330, 'bhisho-eastern-cape', 'Bhisho', 'EASTERN_CAPE', -32.84721, 27.44218, 137287),
  (gen_random_uuid()::text, 1019704, 'bethlehem-free-state', 'Bethlehem', 'FREE_STATE', -28.23078, 28.30707, 83654),
  (gen_random_uuid()::text, 1019760, 'bethal-mpumalanga', 'Bethal', 'MPUMALANGA', -26.45794, 29.46553, 101919),
  (gen_random_uuid()::text, 1019933, 'bergville-kwazulu-natal', 'Bergville', 'KWAZULU_NATAL', -28.73122, 29.35187, 0),
  (gen_random_uuid()::text, 1020066, 'berea-kwazulu-natal', 'Berea', 'KWAZULU_NATAL', -29.85185, 30.99337, 15000),
  (gen_random_uuid()::text, 1020098, 'benoni-gauteng', 'Benoni', 'GAUTENG', -26.18848, 28.32078, 605344),
  (gen_random_uuid()::text, 1020340, 'belfast-mpumalanga', 'Belfast', 'MPUMALANGA', -25.68991, 30.03504, 11916),
  (gen_random_uuid()::text, 1020641, 'beaufort-west-western-cape', 'Beaufort West', 'WESTERN_CAPE', -32.35671, 22.58295, 44737),
  (gen_random_uuid()::text, 1021040, 'barkly-west-northern-cape', 'Barkly West', 'NORTHERN_CAPE', -28.53537, 24.52151, 11621),
  (gen_random_uuid()::text, 1021046, 'barkly-east-eastern-cape', 'Barkly East', 'EASTERN_CAPE', -30.9683, 27.59567, 0),
  (gen_random_uuid()::text, 1021086, 'barberton-mpumalanga', 'Barberton', 'MPUMALANGA', -25.78842, 31.05319, 67927),
  (gen_random_uuid()::text, 1021360, 'ballito-kwazulu-natal', 'Ballito', 'KWAZULU_NATAL', -29.53897, 31.21439, 17218),
  (gen_random_uuid()::text, 1021396, 'balfour-mpumalanga', 'Balfour', 'MPUMALANGA', -26.66331, 28.59016, 46008),
  (gen_random_uuid()::text, 1022145, 'ashton-western-cape', 'Ashton', 'WESTERN_CAPE', -33.83136, 20.05595, 0),
  (gen_random_uuid()::text, 1022508, 'apel-limpopo', 'Apel', 'LIMPOPO', -24.41445, 29.74991, 0),
  (gen_random_uuid()::text, 1023287, 'allanridge-free-state', 'Allanridge', 'FREE_STATE', -27.75431, 26.64382, 31700),
  (gen_random_uuid()::text, 1023309, 'aliwal-north-eastern-cape', 'Aliwal North', 'EASTERN_CAPE', -30.69366, 26.71141, 44436),
  (gen_random_uuid()::text, 1023332, 'alice-eastern-cape', 'Alice', 'EASTERN_CAPE', -32.78749, 26.8344, 9788),
  (gen_random_uuid()::text, 1023441, 'alberton-gauteng', 'Alberton', 'GAUTENG', -26.26786, 28.12225, 121536),
  (gen_random_uuid()::text, 1023445, 'albertina-western-cape', 'Albertina', 'WESTERN_CAPE', -34.20544, 21.58001, 6372),
  (gen_random_uuid()::text, 1023656, 'adelaide-eastern-cape', 'Adelaide', 'EASTERN_CAPE', -32.70747, 26.29564, 12212),
  (gen_random_uuid()::text, 1105726, 'ekangala-gauteng', 'Ekangala', 'GAUTENG', -25.69619, 28.74918, 37650),
  (gen_random_uuid()::text, 1105776, 'midrand-gauteng', 'Midrand', 'GAUTENG', -25.98953, 28.12843, 173009),
  (gen_random_uuid()::text, 1105777, 'centurion-gauteng', 'Centurion', 'GAUTENG', -25.85891, 28.18577, 233386),
  (gen_random_uuid()::text, 3359041, 'worcester-western-cape', 'Worcester', 'WESTERN_CAPE', -33.64651, 19.44852, 127597),
  (gen_random_uuid()::text, 3359510, 'wellington-western-cape', 'Wellington', 'WESTERN_CAPE', -33.63981, 19.0112, 55543),
  (gen_random_uuid()::text, 3359736, 'vredendal-western-cape', 'Vredendal', 'WESTERN_CAPE', -31.66833, 18.50119, 14806),
  (gen_random_uuid()::text, 3359741, 'vredenburg-western-cape', 'Vredenburg', 'WESTERN_CAPE', -32.90719, 17.98997, 38382),
  (gen_random_uuid()::text, 3361025, 'stellenbosch-western-cape', 'Stellenbosch', 'WESTERN_CAPE', -33.93462, 18.86676, 94263),
  (gen_random_uuid()::text, 3361142, 'springbok-northern-cape', 'Springbok', 'NORTHERN_CAPE', -29.66434, 17.8865, 10438),
  (gen_random_uuid()::text, 3361934, 'saldanha-western-cape', 'Saldanha', 'WESTERN_CAPE', -33.01167, 17.9442, 68284),
  (gen_random_uuid()::text, 3362024, 'rosebank-western-cape', 'Rosebank', 'WESTERN_CAPE', -33.95556, 18.47417, 10000),
  (gen_random_uuid()::text, 3362349, 'robertson-western-cape', 'Robertson', 'WESTERN_CAPE', -33.80342, 19.88537, 27715),
  (gen_random_uuid()::text, 3362713, 'port-nolloth-northern-cape', 'Port Nolloth', 'NORTHERN_CAPE', -29.25188, 16.8697, 0),
  (gen_random_uuid()::text, 3362755, 'pofadder-northern-cape', 'Pofadder', 'NORTHERN_CAPE', -29.1283, 19.39492, 3287),
  (gen_random_uuid()::text, 3362870, 'piketberg-western-cape', 'Piketberg', 'WESTERN_CAPE', -32.90323, 18.75704, 0),
  (gen_random_uuid()::text, 3363094, 'paarl-western-cape', 'Paarl', 'WESTERN_CAPE', -33.73378, 18.97523, 190000),
  (gen_random_uuid()::text, 3363957, 'moorreesburg-western-cape', 'Moorreesburg', 'WESTERN_CAPE', -33.15388, 18.66031, 0),
  (gen_random_uuid()::text, 3364346, 'malmesbury-western-cape', 'Malmesbury', 'WESTERN_CAPE', -33.4608, 18.72714, 34991),
  (gen_random_uuid()::text, 3364682, 'lansdowne-western-cape', 'Lansdowne', 'WESTERN_CAPE', -33.98735, 18.49746, 17399),
  (gen_random_uuid()::text, 3365083, 'kraaifontein-western-cape', 'Kraaifontein', 'WESTERN_CAPE', -33.84808, 18.71723, 57911),
  (gen_random_uuid()::text, 3366880, 'hermanus-western-cape', 'Hermanus', 'WESTERN_CAPE', -34.4187, 19.23446, 25153),
  (gen_random_uuid()::text, 3367513, 'grabouw-western-cape', 'Grabouw', 'WESTERN_CAPE', -34.15152, 19.01509, 29885),
  (gen_random_uuid()::text, 3367786, 'garies-northern-cape', 'Garies', 'NORTHERN_CAPE', -30.56223, 17.98905, 0),
  (gen_random_uuid()::text, 3369056, 'constantia-western-cape', 'Constantia', 'WESTERN_CAPE', -34.03139, 18.41833, 6922),
  (gen_random_uuid()::text, 3369098, 'claremont-western-cape', 'Claremont', 'WESTERN_CAPE', -33.98056, 18.46528, 14531),
  (gen_random_uuid()::text, 3369100, 'clanwilliam-western-cape', 'Clanwilliam', 'WESTERN_CAPE', -32.18173, 18.89217, 0),
  (gen_random_uuid()::text, 3369129, 'ceres-western-cape', 'Ceres', 'WESTERN_CAPE', -33.36889, 19.31095, 41596),
  (gen_random_uuid()::text, 3369157, 'cape-town-western-cape', 'Cape Town', 'WESTERN_CAPE', -33.92584, 18.42322, 3433441),
  (gen_random_uuid()::text, 3369174, 'calvinia-northern-cape', 'Calvinia', 'NORTHERN_CAPE', -31.47069, 19.77601, 8146),
  (gen_random_uuid()::text, 3369179, 'caledon-western-cape', 'Caledon', 'WESTERN_CAPE', -34.22997, 19.4265, 4687),
  (gen_random_uuid()::text, 3370105, 'bergvliet-western-cape', 'Bergvliet', 'WESTERN_CAPE', -34.04746, 18.4525, 3902),
  (gen_random_uuid()::text, 3370352, 'atlantis-western-cape', 'Atlantis', 'WESTERN_CAPE', -33.56668, 18.48335, 60266),
  (gen_random_uuid()::text, 6942529, 'sunset-beach-western-cape', 'Sunset Beach', 'WESTERN_CAPE', -33.85395, 18.49231, 2000),
  (gen_random_uuid()::text, 7302797, 'eden-glen-gauteng', 'Eden Glen', 'GAUTENG', -26.1323, 28.16859, 7345),
  (gen_random_uuid()::text, 7302802, 'rondebosch-western-cape', 'Rondebosch', 'WESTERN_CAPE', -33.96333, 18.47639, 15158),
  (gen_random_uuid()::text, 7506857, 'newlands-western-cape', 'Newlands', 'WESTERN_CAPE', -33.97846, 18.4481, 5343),
  (gen_random_uuid()::text, 7576313, 'bela-bela-limpopo', 'Bela-Bela', 'LIMPOPO', -24.885, 28.29417, 0),
  (gen_random_uuid()::text, 7730334, 'lephalale-limpopo', 'Lephalale', 'LIMPOPO', -23.66607, 27.74477, 0),
  (gen_random_uuid()::text, 8030223, 'musina-limpopo', 'Musina', 'LIMPOPO', -22.34881, 30.04074, 0),
  (gen_random_uuid()::text, 8030233, 'midstream-gauteng', 'Midstream', 'GAUTENG', -25.91849, 28.19881, 25000),
  (gen_random_uuid()::text, 8063456, 'mandeni-kwazulu-natal', 'Mandeni', 'KWAZULU_NATAL', -29.14691, 31.41403, 0),
  (gen_random_uuid()::text, 8604596, 'retreat-western-cape', 'Retreat', 'WESTERN_CAPE', -34.05515, 18.47617, 32289),
  (gen_random_uuid()::text, 8764562, 'diepsloot-gauteng', 'Diepsloot', 'GAUTENG', -25.93312, 28.01213, 350000),
  (gen_random_uuid()::text, 10295373, 'hardys-memories-of-africa-western-cape', 'Hardys Memories of Africa', 'WESTERN_CAPE', -33.90539, 20.7169, 7500),
  (gen_random_uuid()::text, 11204670, 'eastleigh-gauteng', 'Eastleigh', 'GAUTENG', -26.12965, 28.15541, 6988),
  (gen_random_uuid()::text, 11205175, 'riverlea-gauteng', 'Riverlea', 'GAUTENG', -26.2119, 27.97322, 0),
  (gen_random_uuid()::text, 11427405, 'eden-glen-ext-60-gauteng', 'Eden Glen Ext 60', 'GAUTENG', -26.12593, 28.165, 5494),
  (gen_random_uuid()::text, 12104196, 'thornhill-eastern-cape', 'Thornhill', 'EASTERN_CAPE', -33.89511, 25.13914, 5000)
ON CONFLICT ("geoname_id") DO NOTHING;

-- Link existing sellers to a place when their town matches exactly
-- (same name, same province). Anything else is left for the seller to choose.
UPDATE "sellers" s SET "place_id" = p.id
FROM "places" p
WHERE s.place_id IS NULL
  AND s.province = p.province
  AND lower(trim(s.location)) = lower(p.name);
