import "server-only";
import { db } from "@/lib/db";

// In-app notifications. Only NEW_POST today.
//
// When a seller publishes, every follower gets one notification, written by a
// single INSERT … SELECT from follows (fast even for tens of thousands of
// followers). While a follower hasn't read the last one from that seller, a
// new post updates it (count + 1, latest post) instead of adding another.
// A post is never counted twice for a follower, so retries are safe.
export async function notifyFollowersOfPost(sellerId: string, postId: string): Promise<number> {
  return db.$executeRaw`
    INSERT INTO "notifications" ("id", "user_id", "type", "seller_id", "post_id", "post_ids", "count", "created_at", "updated_at")
    SELECT gen_random_uuid(), f."user_id", 'NEW_POST', f."seller_id", ${postId}, ARRAY[${postId}], 1, now(), now()
    FROM "follows" f
    JOIN "sellers" s ON s."id" = f."seller_id"
    JOIN "posts" p ON p."id" = ${postId} AND p."seller_id" = s."id" AND p."status" = 'PUBLISHED'
    WHERE f."seller_id" = ${sellerId}
      AND s."status" = 'ACTIVE' AND s."storefront_published_at" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM "notifications" n
        WHERE n."user_id" = f."user_id" AND n."seller_id" = f."seller_id" AND ${postId} = ANY(n."post_ids")
      )
    ON CONFLICT ("user_id", "seller_id", "type") WHERE "read_at" IS NULL
    DO UPDATE SET
      "count" = "notifications"."count" + 1,
      "post_id" = EXCLUDED."post_id",
      "post_ids" = array_append("notifications"."post_ids", ${postId}),
      "updated_at" = now()`;
}

export async function unreadCount(userId: string): Promise<number> {
  return db.notification.count({ where: { userId, readAt: null } });
}

// Latest notifications. A single-post notification whose post is no longer
// public is left out; a grouped one links to the storefront instead.
export async function listNotifications(userId: string, take = 50) {
  const rows = await db.notification.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take,
    select: {
      id: true,
      type: true,
      count: true,
      updatedAt: true,
      readAt: true,
      seller: {
        select: {
          slug: true,
          businessName: true,
          status: true,
          storefrontPublishedAt: true,
          logo: { select: { url: true, thumbUrl: true, width: true, height: true, altText: true } },
        },
      },
      post: {
        select: {
          code: true,
          status: true,
          media: { orderBy: { position: "asc" }, take: 1, select: { media: { select: { url: true, thumbUrl: true, width: true, height: true, altText: true } } } },
        },
      },
    },
  });
  return rows.flatMap((n) => {
    if (n.seller.status !== "ACTIVE" || !n.seller.storefrontPublishedAt) return [];
    const postLive = n.post?.status === "PUBLISHED" && n.post.media.length > 0;
    if (!postLive && n.count === 1) return [];
    return [
      {
        id: n.id,
        count: n.count,
        updatedAt: n.updatedAt,
        unread: n.readAt === null,
        seller: { slug: n.seller.slug, businessName: n.seller.businessName, logo: n.seller.logo },
        href: postLive ? `/s/${n.seller.slug}/posts/${n.post!.code}` : `/s/${n.seller.slug}/posts`,
        photo: postLive ? n.post!.media[0].media : null,
      },
    ];
  });
}

export async function markAllRead(userId: string) {
  await db.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
}
