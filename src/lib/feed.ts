import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { FEED_PAGE_SIZE, RECENTLY_ACTIVE_DAYS, encodeCursor, type FeedCursor } from "@/lib/feed-rules";

// The buyer feed. Built on read: one indexed query over published posts from
// followed sellers, paged by (publishedAt, code). Pages only call these two
// functions, so moving to a precomputed feed table later (filled when a post
// is published) changes this file and nothing else.

const photoSelect = { url: true, thumbUrl: true, width: true, height: true, altText: true } as const;

// Only posts buyers may see: published, with photos, from a seller whose
// storefront is live.
const visiblePost = {
  status: "PUBLISHED",
  media: { some: {} },
  seller: { status: "ACTIVE", storefrontPublishedAt: { not: null } },
} satisfies Prisma.PostWhereInput;

const sellerCardSelect = {
  slug: true,
  businessName: true,
  areaDetail: true,
  location: true,
  province: true,
  place: { select: { name: true } },
  logo: { select: photoSelect },
} as const;

type SellerCardRow = Prisma.SellerGetPayload<{ select: typeof sellerCardSelect }>;

function toSellerCard(s: SellerCardRow) {
  return {
    slug: s.slug,
    businessName: s.businessName,
    logo: s.logo,
    area: { areaDetail: s.areaDetail, placeName: s.place?.name ?? null, location: s.location, province: s.province },
  };
}

export async function getFollowingFeed(userId: string, cursor: FeedCursor | null, limit = FEED_PAGE_SIZE) {
  const rows = await db.post.findMany({
    where: {
      ...visiblePost,
      seller: { ...visiblePost.seller, followers: { some: { userId } } },
      ...(cursor
        ? { OR: [{ publishedAt: { lt: cursor.publishedAt } }, { publishedAt: cursor.publishedAt, code: { lt: cursor.code } }] }
        : {}),
    },
    orderBy: [{ publishedAt: "desc" }, { code: "desc" }],
    take: limit + 1,
    select: {
      code: true,
      caption: true,
      publishedAt: true,
      seller: { select: sellerCardSelect },
      media: { orderBy: { position: "asc" }, take: 1, select: { media: { select: { ...photoSelect, captureSource: true, capturedAt: true } } } },
      _count: { select: { media: true } },
    },
  });
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    posts: page.map((p) => ({
      code: p.code,
      caption: p.caption,
      publishedAt: p.publishedAt!,
      seller: toSellerCard(p.seller),
      photo: p.media[0].media,
      photoCount: p._count.media,
    })),
    nextCursor: rows.length > limit && last ? encodeCursor({ publishedAt: last.publishedAt!, code: last.code }) : null,
  };
}

export type FeedPost = Awaited<ReturnType<typeof getFollowingFeed>>["posts"][number];

// "Recently active sellers": live storefronts with a post in the last 30
// days, most recent first. Nothing here is a popularity measure.
export async function recentlyActiveSellers({
  categorySlugs,
  excludeSellerId,
  limit = 12,
}: {
  categorySlugs?: readonly string[];
  excludeSellerId?: string | null;
  limit?: number;
}) {
  const since = new Date(Date.now() - RECENTLY_ACTIVE_DAYS * 86_400_000);
  const latest = await db.post.groupBy({
    by: ["sellerId"],
    where: {
      ...visiblePost,
      publishedAt: { gte: since },
      ...(excludeSellerId ? { sellerId: { not: excludeSellerId } } : {}),
      ...(categorySlugs?.length
        ? { seller: { ...visiblePost.seller, categories: { some: { category: { slug: { in: [...categorySlugs] } } } } } }
        : {}),
    },
    _max: { publishedAt: true },
    _count: { _all: true },
    orderBy: { _max: { publishedAt: "desc" } },
    take: limit,
  });
  if (latest.length === 0) return [];

  const sellers = await db.seller.findMany({
    where: { id: { in: latest.map((l) => l.sellerId) } },
    select: {
      id: true,
      ...sellerCardSelect,
      tagline: true,
      categories: { select: { category: { select: { name: true } } }, take: 2 },
      // The most recent post's first photo, as a preview.
      posts: {
        where: visiblePost,
        orderBy: [{ publishedAt: "desc" }, { code: "desc" }],
        take: 1,
        select: { code: true, media: { orderBy: { position: "asc" }, take: 1, select: { media: { select: photoSelect } } } },
      },
    },
  });
  const byId = new Map(sellers.map((s) => [s.id, s]));
  return latest.flatMap((l) => {
    const s = byId.get(l.sellerId);
    if (!s || s.posts.length === 0) return [];
    return [
      {
        sellerId: s.id, // server-side only: follow state lookup
        ...toSellerCard(s),
        tagline: s.tagline,
        categories: s.categories.map((c) => c.category.name),
        lastPostedAt: l._max.publishedAt!,
        recentPosts: l._count._all,
        preview: { code: s.posts[0].code, photo: s.posts[0].media[0].media },
      },
    ];
  });
}

export async function followedSellerIds(userId: string, sellerIds: string[]): Promise<Set<string>> {
  if (sellerIds.length === 0) return new Set();
  const rows = await db.follow.findMany({ where: { userId, sellerId: { in: sellerIds } }, select: { sellerId: true } });
  return new Set(rows.map((r) => r.sellerId));
}
