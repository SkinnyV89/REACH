import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { FOLLOW_CHANGES_PER_HOUR, MAX_FOLLOWS } from "@/lib/feed-rules";
import { hit } from "@/lib/public-campaigns";

// Following. Every function takes the user id from the session. Who follows
// whom is private: sellers get a count, never a list.

export class FollowError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "SELF" | "LIMIT" | "RATE_LIMITED",
    message: string,
  ) {
    super(message);
  }
}

// A seller that can be followed: active, with a published storefront.
async function followableSeller(sellerSlug: string) {
  const seller = await db.seller.findUnique({
    where: { slug: sellerSlug },
    select: { id: true, userId: true, status: true, storefrontPublishedAt: true },
  });
  if (!seller || seller.status !== "ACTIVE" || !seller.storefrontPublishedAt) {
    throw new FollowError("NOT_FOUND", "That storefront isn't available.");
  }
  return seller;
}

async function rateLimit(userId: string) {
  if ((await hit(`follow:${userId}`, 60)) > FOLLOW_CHANGES_PER_HOUR) {
    throw new FollowError("RATE_LIMITED", "You've followed and unfollowed a lot in the last hour. Please try again later.");
  }
}

export async function follow(userId: string, sellerSlug: string) {
  const seller = await followableSeller(sellerSlug);
  if (seller.userId === userId) throw new FollowError("SELF", "You can't follow your own storefront.");
  await rateLimit(userId);
  await db.$transaction(async (tx) => {
    // Serialise per user so the follow cap holds under double taps.
    await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
    const existing = await tx.follow.findUnique({ where: { userId_sellerId: { userId, sellerId: seller.id } } });
    if (existing) return;
    if ((await tx.follow.count({ where: { userId } })) >= MAX_FOLLOWS) {
      throw new FollowError("LIMIT", `You can follow up to ${MAX_FOLLOWS} sellers. Unfollow some to follow more.`);
    }
    try {
      await tx.follow.create({ data: { userId, sellerId: seller.id } });
    } catch (error) {
      // The database refuses self-follows too (trigger), as a backstop.
      if (error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Prisma.PrismaClientUnknownRequestError) {
        if (String(error.message).includes("cannot follow own storefront")) throw new FollowError("SELF", "You can't follow your own storefront.");
      }
      throw error;
    }
  });
}

// Unfollowing works even if the storefront has since been unpublished.
export async function unfollow(userId: string, sellerSlug: string) {
  const seller = await db.seller.findUnique({ where: { slug: sellerSlug }, select: { id: true } });
  if (!seller) return;
  await rateLimit(userId);
  await db.follow.deleteMany({ where: { userId, sellerId: seller.id } });
}

export async function isFollowing(userId: string, sellerId: string): Promise<boolean> {
  return (await db.follow.count({ where: { userId, sellerId } })) > 0;
}

export async function followingCount(userId: string): Promise<number> {
  return db.follow.count({ where: { userId } });
}

export async function followerCount(sellerId: string): Promise<number> {
  return db.follow.count({ where: { sellerId } });
}

// The user's own list, newest first. Sellers whose storefront is no longer
// public are listed (so they can be unfollowed) but marked unavailable.
export async function listFollowing(userId: string) {
  const rows = await db.follow.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      seller: {
        select: {
          slug: true,
          businessName: true,
          tagline: true,
          status: true,
          storefrontPublishedAt: true,
          areaDetail: true,
          location: true,
          province: true,
          place: { select: { name: true } },
          logo: { select: { url: true, thumbUrl: true, width: true, height: true, altText: true } },
        },
      },
    },
  });
  return rows.map(({ seller, createdAt }) => ({
    followedAt: createdAt,
    slug: seller.slug,
    businessName: seller.businessName,
    tagline: seller.tagline,
    available: seller.status === "ACTIVE" && seller.storefrontPublishedAt !== null,
    area: { areaDetail: seller.areaDetail, placeName: seller.place?.name ?? null, location: seller.location, province: seller.province },
    logo: seller.logo,
  }));
}
