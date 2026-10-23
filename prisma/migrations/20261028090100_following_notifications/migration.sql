-- Step 3: buyer accounts, following and in-app notifications. Additive only.

-- role now means permissions only (ADMIN or not). Nothing checks for SELLER,
-- so existing users move to MEMBER; seller pages check the seller profile.
UPDATE "users" SET "role" = 'MEMBER' WHERE "role" = 'SELLER';

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('NEW_POST');

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'MEMBER';

-- CreateTable
CREATE TABLE "follows" (
    "user_id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "follows_pkey" PRIMARY KEY ("user_id","seller_id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "seller_id" TEXT NOT NULL,
    "post_id" TEXT,
    "post_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "count" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "follows_seller_id_created_at_idx" ON "follows"("seller_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_updated_at_idx" ON "notifications"("user_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_post_id_idx" ON "notifications"("post_id");

-- CreateIndex
CREATE INDEX "posts_status_published_at_code_idx" ON "posts"("status", "published_at" DESC, "code" DESC);

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "follows" ADD CONSTRAINT "follows_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "sellers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- One unread NEW_POST notification per follower and seller: new posts update
-- it (count + 1) instead of adding another. Also serves the unread count.
CREATE UNIQUE INDEX "notifications_unread_group_key" ON "notifications"("user_id", "seller_id", "type") WHERE "read_at" IS NULL;

ALTER TABLE "notifications" ADD CONSTRAINT "notifications_count_check" CHECK ("count" >= 1);

-- A user can't follow their own storefront.
CREATE FUNCTION "follows_not_self"() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "sellers" WHERE "id" = NEW."seller_id" AND "user_id" = NEW."user_id") THEN
    RAISE EXCEPTION 'cannot follow own storefront' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER "follows_not_self" BEFORE INSERT OR UPDATE ON "follows" FOR EACH ROW EXECUTE FUNCTION "follows_not_self"();
