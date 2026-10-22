-- Step 4b: opening hours, collection address and shop pin, call number.
-- Additive only.

-- AlterTable
ALTER TABLE "sellers" ADD COLUMN     "call_number" TEXT,
ADD COLUMN     "closed_until" TIMESTAMP(3),
ADD COLUMN     "collection_address" TEXT,
ADD COLUMN     "hours_note" TEXT,
ADD COLUMN     "offers_collection" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pin_latitude" DOUBLE PRECISION,
ADD COLUMN     "pin_longitude" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "seller_hours" (
    "id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "day_of_week" INTEGER NOT NULL,
    "opens_at" INTEGER NOT NULL,
    "closes_at" INTEGER NOT NULL,

    CONSTRAINT "seller_hours_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "seller_hours_seller_id_day_of_week_idx" ON "seller_hours"("seller_id", "day_of_week");

-- AddForeignKey
ALTER TABLE "seller_hours" ADD CONSTRAINT "seller_hours_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Hours: a real weekday, times within the day, and a slot that isn't empty.
-- closes_at < opens_at means the slot runs past midnight.
ALTER TABLE "seller_hours" ADD CONSTRAINT "seller_hours_valid_check"
  CHECK ("day_of_week" BETWEEN 0 AND 6 AND "opens_at" BETWEEN 0 AND 1439 AND "closes_at" BETWEEN 1 AND 1440 AND "opens_at" <> "closes_at");

-- A pin is both coordinates or neither, and inside South Africa.
ALTER TABLE "sellers" ADD CONSTRAINT "sellers_pin_check"
  CHECK (("pin_latitude" IS NULL) = ("pin_longitude" IS NULL)
     AND ("pin_latitude" IS NULL OR ("pin_latitude" BETWEEN -35.5 AND -21.5 AND "pin_longitude" BETWEEN 16 AND 33.5)));

-- Offering collection needs an address and a pin, so buyers can find it.
ALTER TABLE "sellers" ADD CONSTRAINT "sellers_collection_check"
  CHECK (NOT "offers_collection" OR ("collection_address" IS NOT NULL AND "pin_latitude" IS NOT NULL));
