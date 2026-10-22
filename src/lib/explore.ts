import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import {
  EXPLORE_PAGE_SIZE,
  NEAR_RADIUS_KM,
  WORK_PAGE_SIZE,
  completeSignal,
  distanceKm,
  distanceLabel,
  diversify,
  freshSignal,
  nearSignal,
  nearestPlace,
  newSignal,
  rankByScore,
  reasonChips,
  rotationDay,
  scoreSignals,
  type LatLng,
} from "@/lib/explore-rules";
import { DISCOVERY_FILTERS } from "@/lib/feed-rules";
import { openStatus } from "@/lib/hours-rules";
import { formatArea } from "@/lib/storefront-rules";

// Explore: public discovery of sellers and their latest work, ranked by
// src/lib/explore-rules.ts. One query loads every candidate's signals and the
// score is computed here; at launch size (hundreds to a few thousand live
// storefronts) that's tens of milliseconds. If it grows past that, a signals
// table refreshed every few hours can replace the query behind these
// functions without changing any page.

export type ExplorePlace = { id: string; slug: string; name: string; province: string; latitude: number; longitude: number };

const placeSelect = { id: true, slug: true, name: true, province: true, latitude: true, longitude: true } as const;
const photoSelect = { url: true, thumbUrl: true, width: true, height: true, altText: true } as const;

const liveSeller = {
  status: "ACTIVE",
  storefrontPublishedAt: { not: null },
  placeId: { not: null },
} satisfies Prisma.SellerWhereInput;

const visiblePost = { status: "PUBLISHED", media: { some: {} } } satisfies Prisma.PostWhereInput;

// ---------------------------------------------------------------------------
// Places and the buyer's town
// ---------------------------------------------------------------------------

export async function placeBySlug(slug: unknown): Promise<ExplorePlace | null> {
  if (typeof slug !== "string" || !/^[a-z0-9-]{2,80}$/.test(slug)) return null;
  return db.place.findFirst({ where: { slug, isActive: true }, select: placeSelect });
}

export async function placeById(id: string | null | undefined): Promise<ExplorePlace | null> {
  if (!id) return null;
  return db.place.findFirst({ where: { id, isActive: true }, select: placeSelect });
}

// "Use my location": the nearest town to a (rounded) point. The point itself
// is never stored.
export async function snapToPlace(point: LatLng): Promise<ExplorePlace | null> {
  const places = await db.place.findMany({ where: { isActive: true }, select: placeSelect });
  const nearest = nearestPlace(point, places);
  return nearest ? (places.find((p) => p.id === nearest.id) ?? null) : null;
}

export async function saveBuyerPlace(userId: string, placeId: string) {
  await db.user.update({ where: { id: userId }, data: { placeId } });
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export type CategoryFilter = { key: string; label: string; categories: string[] };

// A launch filter key ("hair-beauty") or any single category slug.
export async function resolveCategoryFilter(key: unknown): Promise<CategoryFilter | null> {
  if (typeof key !== "string" || !/^[a-z0-9-]{2,60}$/.test(key)) return null;
  const preset = DISCOVERY_FILTERS.find((f) => f.key === key);
  if (preset) return { key: preset.key, label: preset.label, categories: [...preset.categories] };
  const category = await db.category.findFirst({ where: { slug: key, isActive: true }, select: { slug: true, name: true } });
  return category ? { key: category.slug, label: category.name, categories: [category.slug] } : null;
}

export async function exploreCategoryOptions(): Promise<CategoryFilter[]> {
  const presetSlugs = new Set<string>(DISCOVERY_FILTERS.flatMap((f) => f.categories));
  const others = await db.category.findMany({
    where: { isActive: true, slug: { notIn: [...presetSlugs] } },
    orderBy: { sortOrder: "asc" },
    select: { slug: true, name: true },
  });
  return [
    ...DISCOVERY_FILTERS.map((f) => ({ key: f.key, label: f.label, categories: [...f.categories] })),
    ...others.map((c) => ({ key: c.slug, label: c.name, categories: [c.slug] })),
  ];
}

// ---------------------------------------------------------------------------
// Search (pg_trgm): business name, tagline, category names and item names.
// ---------------------------------------------------------------------------

type SearchHit = { sellerId: string; relevance: number };

function likePattern(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

// Live sellers matching the query, with a 0..1 text relevance. Typos are
// tolerated through trigram word similarity.
async function searchSellers(q: string): Promise<SearchHit[]> {
  const like = likePattern(q);
  const rows = await db.$queryRaw<{ seller_id: string; relevance: number }[]>`
    WITH matches AS (
      SELECT s."id" AS seller_id, GREATEST(
        CASE WHEN s."business_name" ILIKE ${like} THEN 1 ELSE word_similarity(${q}, s."business_name") END,
        CASE WHEN coalesce(s."tagline", '') ILIKE ${like} THEN 0.8 ELSE word_similarity(${q}, coalesce(s."tagline", '')) * 0.8 END
      ) AS relevance
      FROM "sellers" s
      WHERE s."status" = 'ACTIVE' AND s."storefront_published_at" IS NOT NULL
        AND (s."business_name" ILIKE ${like} OR ${q} <% s."business_name" OR s."tagline" ILIKE ${like} OR ${q} <% s."tagline")
      UNION ALL
      SELECT p."seller_id", CASE WHEN p."name" ILIKE ${like} THEN 0.9 ELSE word_similarity(${q}, p."name") * 0.9 END
      FROM "products" p
      WHERE p."status" <> 'ARCHIVED' AND (p."name" ILIKE ${like} OR ${q} <% p."name")
      UNION ALL
      SELECT sc."seller_id", 0.7
      FROM "seller_categories" sc JOIN "categories" c ON c."id" = sc."category_id"
      WHERE c."is_active" AND c."name" ILIKE ${like}
    )
    SELECT seller_id, MAX(relevance)::float AS relevance FROM matches GROUP BY seller_id`;
  return rows.map((r) => ({ sellerId: r.seller_id, relevance: Number(r.relevance) }));
}

// The items that matched, shown on each card ("Knotless braids · From R450").
async function matchedItems(q: string, sellerIds: string[]) {
  if (sellerIds.length === 0) return new Map<string, { name: string; slug: string; priceType: string; price: string | null }[]>();
  const like = likePattern(q);
  const rows = await db.$queryRaw<{ seller_id: string; name: string; slug: string; price_type: string; price: string | null }[]>`
    SELECT p."seller_id", p."name", p."slug", p."price_type"::text AS price_type, p."price"::text AS price
    FROM "products" p
    WHERE p."seller_id" = ANY(${sellerIds}) AND p."status" <> 'ARCHIVED' AND (p."name" ILIKE ${like} OR ${q} <% p."name")
    ORDER BY word_similarity(${q}, p."name") DESC, p."name"`;
  const map = new Map<string, { name: string; slug: string; priceType: string; price: string | null }[]>();
  for (const r of rows) {
    const list = map.get(r.seller_id) ?? [];
    if (list.length < 3) list.push({ name: r.name, slug: r.slug, priceType: r.price_type, price: r.price ? Number(r.price).toFixed(2) : null });
    map.set(r.seller_id, list);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Sellers
// ---------------------------------------------------------------------------

const candidateSelect = {
  id: true,
  slug: true,
  businessName: true,
  tagline: true,
  description: true,
  fulfilment: true,
  serviceRadiusKm: true,
  storefrontPublishedAt: true,
  areaDetail: true,
  location: true,
  province: true,
  place: { select: placeSelect },
  logo: { select: photoSelect },
  cover: { select: photoSelect },
  categories: { orderBy: { category: { sortOrder: "asc" } }, select: { category: { select: { name: true, slug: true } } } },
  products: {
    where: { status: { not: "ARCHIVED" } },
    select: { priceType: true, availabilityUpdatedAt: true, _count: { select: { photos: true } } },
  },
  posts: {
    where: visiblePost,
    orderBy: [{ publishedAt: "desc" }, { code: "desc" }],
    take: 1,
    select: { code: true, publishedAt: true, media: { orderBy: { position: "asc" }, take: 1, select: { media: { select: photoSelect } } } },
  },
  _count: { select: { posts: { where: visiblePost } } },
  pinLatitude: true,
  pinLongitude: true,
  closedUntil: true,
  hours: { select: { dayOfWeek: true, opensAt: true, closesAt: true } },
} satisfies Prisma.SellerSelect;

// Where a seller is: their shop pin when set (precise), else their town centre.
function sellerPoint(c: { place: { latitude: number; longitude: number } | null; pinLatitude: number | null; pinLongitude: number | null }): LatLng {
  return c.pinLatitude !== null && c.pinLongitude !== null ? { latitude: c.pinLatitude, longitude: c.pinLongitude } : c.place!;
}

type Candidate = Prisma.SellerGetPayload<{ select: typeof candidateSelect }>;

export type ExploreSellerCard = {
  sellerId: string; // server-side only (follow state); never rendered
  slug: string;
  businessName: string;
  tagline: string | null;
  area: string | null;
  category: string | null;
  image: { url: string; thumbUrl: string; width: number; height: number; altText: string | null } | null;
  logo: Candidate["logo"];
  reasons: string[];
  group: "near" | "further" | "all";
  matches: { name: string; slug: string; priceType: string; price: string | null }[];
  openLabel: string | null; // "Open now · closes 20:00", or null if no hours are set
  open: boolean;
};

function scoreCandidate(c: Candidate, place: ExplorePlace | null, now: Date) {
  const sellerPlace = c.place!;
  const km = place ? distanceKm(place, sellerPoint(c)) : null;
  const sameTown = place ? place.id === sellerPlace.id : false;
  const deliversToBuyer = Boolean(km !== null && c.fulfilment.includes("DELIVERY") && c.serviceRadiusKm && km <= c.serviceRadiusKm);
  const lastPostAt = c.posts[0]?.publishedAt ?? null;
  const lastAvailability = c.products.reduce<Date | null>((m, p) => (!m || p.availabilityUpdatedAt > m ? p.availabilityUpdatedAt : m), null);
  const lastActivity = [lastPostAt, lastAvailability].filter((d): d is Date => d !== null).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const signals = {
    near: km === null ? null : nearSignal(km, sameTown, deliversToBuyer),
    fresh: freshSignal(lastActivity, now),
    complete: completeSignal({
      listings: c.products.length,
      listingsWithPhoto: c.products.filter((p) => p._count.photos > 0).length,
      listingsWithPrice: c.products.filter((p) => p.priceType !== "ON_REQUEST").length,
      posts: c._count.posts,
      hasLogoOrCover: Boolean(c.logo || c.cover),
      hasDescription: Boolean(c.description?.trim()),
    }),
    isNew: newSignal(c.storefrontPublishedAt!, now),
  };
  return {
    score: scoreSignals(signals),
    km,
    sameTown,
    deliversToBuyer,
    lastPostAt,
    isNew: signals.isNew > 0,
  };
}

export async function exploreSellers({
  place,
  categories,
  query,
  openNow = false,
  page = 1,
  now = new Date(),
}: {
  place: ExplorePlace | null;
  categories: string[] | null;
  query: string | null;
  openNow?: boolean;
  page?: number;
  now?: Date;
}) {
  const hits = query ? await searchSellers(query) : null;
  if (hits && hits.length === 0) return { cards: [], total: 0, page: 1, pages: 1, nearCount: 0 };
  const relevance = new Map(hits?.map((h) => [h.sellerId, h.relevance]));

  const candidates = await db.seller.findMany({
    where: {
      ...liveSeller,
      ...(categories?.length ? { categories: { some: { category: { slug: { in: categories } } } } } : {}),
      ...(hits ? { id: { in: hits.map((h) => h.sellerId) } } : {}),
    },
    select: candidateSelect,
  });

  const day = rotationDay(now);
  const statusOf = new Map(candidates.map((c) => [c.id, openStatus(c.hours, now, c.closedUntil)]));
  // "Open now" keeps only sellers whose hours say they're open right now
  // (sellers without hours can't be known to be open, so they're left out).
  const eligible = openNow ? candidates.filter((c) => statusOf.get(c.id)?.open) : candidates;
  const scored = eligible.map((c) => {
    const s = scoreCandidate(c, place, now);
    // In a search, text relevance (in 0.1 steps) comes first, then the score.
    const searchBand = hits ? Math.round((relevance.get(c.id) ?? 0) * 10) : 0;
    return { c, s, id: c.id, score: searchBand + s.score };
  });

  const isNear = (x: (typeof scored)[number]) => x.s.km !== null && (x.s.km <= NEAR_RADIUS_KM || x.s.deliversToBuyer);
  const category = (x: (typeof scored)[number]) => x.c.categories[0]?.category.slug ?? "";
  const order = (list: typeof scored) => {
    const ranked = rankByScore(list, day);
    // Variety in the unfiltered view: at most two in a row from one category.
    return categories?.length || query ? ranked : diversify(ranked, category);
  };
  const ordered = place
    ? [...order(scored.filter(isNear)).map((x) => ({ x, group: "near" as const })), ...order(scored.filter((x) => !isNear(x))).map((x) => ({ x, group: "further" as const }))]
    : order(scored).map((x) => ({ x, group: "all" as const }));

  const pages = Math.max(1, Math.ceil(ordered.length / EXPLORE_PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pages);
  const slice = ordered.slice((current - 1) * EXPLORE_PAGE_SIZE, current * EXPLORE_PAGE_SIZE);
  const matches = query ? await matchedItems(query, slice.map(({ x }) => x.id)) : new Map();

  const cards: ExploreSellerCard[] = slice.map(({ x: { c, s }, group }) => ({
    sellerId: c.id,
    slug: c.slug,
    businessName: c.businessName,
    tagline: c.tagline,
    area: formatArea({ areaDetail: c.areaDetail, placeName: c.place!.name, location: c.location, province: c.province }),
    category: c.categories[0]?.category.name ?? null,
    image: c.posts[0]?.media[0]?.media ?? c.cover ?? null,
    logo: c.logo,
    reasons: reasonChips({
      distance: s.km === null ? null : distanceLabel(s.km, s.sameTown, c.place!.name),
      deliversToBuyer: s.deliversToBuyer && !s.sameTown,
      lastPostAt: s.lastPostAt,
      isNew: s.isNew,
      now,
    }),
    group,
    matches: matches.get(c.id) ?? [],
    openLabel: statusOf.get(c.id)?.label ?? null,
    open: statusOf.get(c.id)?.open ?? false,
  }));
  return { cards, total: ordered.length, page: current, pages, nearCount: ordered.filter((o) => o.group === "near").length };
}

// ---------------------------------------------------------------------------
// Latest work: recent posts from live sellers, by recency and nearness.
// ---------------------------------------------------------------------------

const WORK_WINDOW_DAYS = 60;
const WORK_CANDIDATES = 400;

export async function exploreLatestWork({
  place,
  categories,
  page = 1,
  now = new Date(),
}: {
  place: ExplorePlace | null;
  categories: string[] | null;
  page?: number;
  now?: Date;
}) {
  const posts = await db.post.findMany({
    where: {
      ...visiblePost,
      publishedAt: { gte: new Date(now.getTime() - WORK_WINDOW_DAYS * 86_400_000) },
      seller: { ...liveSeller, ...(categories?.length ? { categories: { some: { category: { slug: { in: categories } } } } } : {}) },
    },
    orderBy: [{ publishedAt: "desc" }, { code: "desc" }],
    take: WORK_CANDIDATES,
    select: {
      code: true,
      caption: true,
      publishedAt: true,
      seller: { select: { slug: true, businessName: true, place: { select: placeSelect }, pinLatitude: true, pinLongitude: true } },
      media: { orderBy: { position: "asc" }, take: 1, select: { media: { select: { ...photoSelect, captureSource: true, capturedAt: true } } } },
      _count: { select: { media: true } },
    },
  });
  const day = rotationDay(now);
  const scored = posts.map((p) => {
    const km = place ? distanceKm(place, sellerPoint(p.seller)) : null;
    const sameTown = place ? place.id === p.seller.place!.id : false;
    // Newer work first (halving weekly); nearer work ahead when a town is set.
    const recency = 0.5 ** ((now.getTime() - p.publishedAt!.getTime()) / 86_400_000 / 7);
    const score = km === null ? recency : 0.6 * recency + 0.4 * nearSignal(km, sameTown, false);
    return { id: p.code, score, p, km, sameTown };
  });
  const ordered = rankByScore(scored, day);
  const pages = Math.max(1, Math.ceil(ordered.length / WORK_PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pages);
  return {
    tiles: ordered.slice((current - 1) * WORK_PAGE_SIZE, current * WORK_PAGE_SIZE).map(({ p, km, sameTown }) => ({
      code: p.code,
      caption: p.caption,
      publishedAt: p.publishedAt!,
      seller: { slug: p.seller.slug, businessName: p.seller.businessName },
      distance: km === null ? null : distanceLabel(km, sameTown, p.seller.place!.name),
      photo: p.media[0].media,
      photoCount: p._count.media,
    })),
    total: ordered.length,
    page: current,
    pages,
  };
}

// ---------------------------------------------------------------------------
// Search-engine landing pages: /explore/<category>/<town>
// ---------------------------------------------------------------------------

// Category-filter × town pairs with at least one live seller in that town,
// for the sitemap. Only pages with real sellers are listed.
export async function landingPages() {
  const rows = await db.seller.findMany({
    where: liveSeller,
    select: { place: { select: { slug: true } }, categories: { select: { category: { select: { slug: true } } } } },
  });
  const pairs = new Set<string>();
  for (const r of rows) {
    const slugs = r.categories.map((c) => c.category.slug);
    for (const f of DISCOVERY_FILTERS) if (f.categories.some((c) => slugs.includes(c))) pairs.add(`${f.key}/${r.place!.slug}`);
    for (const s of slugs) if (!DISCOVERY_FILTERS.some((f) => (f.categories as readonly string[]).includes(s))) pairs.add(`${s}/${r.place!.slug}`);
  }
  return [...pairs].sort();
}
