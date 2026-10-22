import "server-only";
import { db } from "@/lib/db";
import type { Channel, LeadFormInput } from "@/lib/lead-rules";
import { createLeadWithLimits, type SubmitResult } from "@/lib/public-campaigns";
import { MAX_POST_TAGS, POST_CODE_RE } from "@/lib/post-rules";
import { ITEM_SLUG_RE, shareCodeOf } from "@/lib/storefront-rules";

// Public storefronts (/s/<seller>) and item pages (/s/<seller>/<item>).
// Reachable by anyone, so every query selects only what a buyer may see.
// A storefront is public only when the seller is active AND has published it.

const SELLER_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Public fields of a stored photo (no ids or storage keys).
const publicPhotoSelect = { url: true, thumbUrl: true, width: true, height: true, altText: true } as const;
const photosSelect = (take?: number) => ({
  orderBy: { position: "asc" as const },
  ...(take ? { take } : {}),
  select: { media: { select: publicPhotoSelect } },
});

const publicSellerSelect = {
  id: true, // server-side only: owner check, lead linking
  slug: true,
  status: true,
  storefrontPublishedAt: true,
  businessName: true,
  tagline: true,
  description: true,
  layout: true,
  areaDetail: true,
  location: true,
  province: true,
  fulfilment: true,
  serviceRadiusKm: true,
  whatsappNumber: true, // server-side only: used by /go/wa, never rendered
  callNumber: true, // server-side only: used by /go/call, never rendered
  // Collection point: rendered only when collection is on, to signed-in
  // buyers (see collectionPoint below).
  offersCollection: true,
  collectionAddress: true,
  pinLatitude: true,
  pinLongitude: true,
  closedUntil: true,
  hoursNote: true,
  hours: { select: { dayOfWeek: true, opensAt: true, closesAt: true } },
  instagramUrl: true,
  facebookUrl: true,
  tiktokUrl: true,
  websiteUrl: true,
  createdAt: true,
  place: { select: { name: true, province: true } },
  logo: { select: publicPhotoSelect },
  cover: { select: publicPhotoSelect },
  categories: { select: { category: { select: { name: true, slug: true } } } },
} as const;

const publicItemSelect = {
  id: true,
  slug: true,
  kind: true,
  name: true,
  description: true,
  priceType: true,
  price: true,
  availability: true,
  availabilityUpdatedAt: true,
  leadTimeDays: true,
  category: { select: { name: true } },
} as const;

async function findSeller(slug: string) {
  if (!SELLER_SLUG_RE.test(slug) || slug.length > 60) return null;
  return db.seller.findUnique({ where: { slug }, select: publicSellerSelect });
}

type SellerRow = NonNullable<Awaited<ReturnType<typeof findSeller>>>;

export function isPublished(seller: Pick<SellerRow, "status" | "storefrontPublishedAt">): boolean {
  return seller.status === "ACTIVE" && seller.storefrontPublishedAt !== null;
}

type PhotoRows = { photos: { media: { url: string; thumbUrl: string; width: number; height: number; altText: string | null } }[] };

function toItem<T extends { price: { toFixed(n: number): string } | null } & PhotoRows>({ photos, ...item }: T) {
  return { ...item, price: item.price?.toFixed(2) ?? null, photos: photos.map((p) => p.media) };
}

// "live": anyone may see it. "unpublished": exists, but only the owner may
// preview it. null: no such storefront.
export async function getStorefront(slug: string) {
  const seller = await findSeller(slug);
  if (!seller) return null;
  const items = await db.product.findMany({
    where: { sellerId: seller.id, status: { not: "ARCHIVED" } },
    orderBy: { updatedAt: "desc" },
    select: { ...publicItemSelect, photos: photosSelect(1) }, // main photo only
  });
  // Out-of-stock items last; otherwise most recently updated first. (Sorting
  // by the enum would follow its declaration order, not what buyers need.)
  items.sort((a, b) => Number(a.availability === "OUT_OF_STOCK") - Number(b.availability === "OUT_OF_STOCK"));
  return { seller, items: items.map(toItem), state: isPublished(seller) ? ("live" as const) : ("unpublished" as const) };
}

export type Storefront = NonNullable<Awaited<ReturnType<typeof getStorefront>>>;

// Resolves an item by its current slug, or an old slug that now redirects.
export async function getStorefrontItem(sellerSlug: string, itemSlug: string) {
  if (!ITEM_SLUG_RE.test(itemSlug) || itemSlug.length > 70) return null;
  const seller = await findSeller(sellerSlug);
  if (!seller) return null;
  const state = isPublished(seller) ? ("live" as const) : ("unpublished" as const);

  const item = await db.product.findFirst({
    where: { sellerId: seller.id, slug: itemSlug, status: { not: "ARCHIVED" } },
    select: { ...publicItemSelect, photos: photosSelect() },
  });
  if (item) return { kind: "item" as const, seller, item: toItem(item), state };

  const redirect = await db.productSlugRedirect.findUnique({
    where: { sellerId_slug: { sellerId: seller.id, slug: itemSlug } },
    select: { product: { select: { slug: true, status: true } } },
  });
  if (redirect && redirect.product.status !== "ARCHIVED") {
    return { kind: "redirect" as const, to: `/s/${seller.slug}/${redirect.product.slug}` };
  }
  return null;
}

// The browser-safe view of a storefront's seller: no ids, no phone number.
export function toPublicSeller(seller: SellerRow) {
  return {
    slug: seller.slug,
    businessName: seller.businessName,
    tagline: seller.tagline,
    description: seller.description,
    layout: seller.layout,
    areaDetail: seller.areaDetail,
    placeName: seller.place?.name ?? null,
    location: seller.location,
    province: seller.place?.province ?? seller.province,
    fulfilment: seller.fulfilment,
    serviceRadiusKm: seller.serviceRadiusKm,
    hasWhatsapp: Boolean(seller.whatsappNumber),
    hasCallNumber: Boolean(seller.callNumber),
    offersCollection: seller.offersCollection,
    hours: seller.hours,
    closedUntil: seller.closedUntil,
    hoursNote: seller.hoursNote,
    logo: seller.logo,
    cover: seller.cover,
    categories: seller.categories.map((c) => c.category.name),
    links: [
      ["Instagram", seller.instagramUrl],
      ["Facebook", seller.facebookUrl],
      ["TikTok", seller.tiktokUrl],
      ["Website", seller.websiteUrl],
    ].filter((l): l is [string, string] => Boolean(l[1])),
    memberSince: seller.createdAt,
  };
}

// A published campaign of this seller, from a ?c=<code> on the storefront
// link. Used to show the campaign and credit enquiries to it.
export async function findCampaignForStorefront(sellerId: string, code: string | null) {
  if (!code) return null;
  const campaign = await db.sellerCampaign.findFirst({
    where: { sellerId, status: "ACTIVE", uniqueLink: { endsWith: `-${code}` } },
    select: { id: true, uniqueLink: true, headline: true, body: true, callToAction: true },
  });
  // endsWith plus an exact check, so a short code can't match by accident.
  return campaign && shareCodeOf(campaign.uniqueLink) === code ? campaign : null;
}

// Enquiry from a published storefront, one of its items, or one of its posts
// (postCode; then itemSlug is ignored).
export async function submitStorefrontLead(
  sellerSlug: string,
  itemSlug: string | null,
  input: LeadFormInput,
  attribution: { channel: Channel; utmSource: string | null; campaignCode: string | null },
  ipHash: string,
  postCode: string | null = null,
): Promise<SubmitResult> {
  const seller = await findSeller(sellerSlug);
  if (!seller) return { ok: false, reason: "not_found" };
  if (!isPublished(seller)) return { ok: false, reason: "unavailable" };

  let productId: string | null = null;
  let postId: string | null = null;
  if (postCode) {
    const post = await findPublishedPost(seller.id, postCode);
    if (!post) return { ok: false, reason: "not_found" };
    postId = post.id;
  } else if (itemSlug) {
    const item = await db.product.findFirst({
      where: { sellerId: seller.id, slug: itemSlug, status: { not: "ARCHIVED" } },
      select: { id: true },
    });
    if (!item) return { ok: false, reason: "not_found" };
    productId = item.id;
  }
  const campaign = await findCampaignForStorefront(seller.id, attribution.campaignCode);

  return createLeadWithLimits({
    sellerId: seller.id,
    scopeKey: `s:${seller.id}`,
    sellerCampaignId: campaign?.id ?? null,
    productId,
    postId,
    source: postId ? "POST" : productId ? "PRODUCT" : "STOREFRONT",
    input,
    attribution: { channel: attribution.channel, utmSource: attribution.utmSource },
    ipHash,
  });
}

// ---------------------------------------------------------------------------
// Anonymous engagement on storefronts
// ---------------------------------------------------------------------------

const DEDUPE_MINUTES = { VIEW: 30, WHATSAPP_CLICK: 1 } as const;

// Records a view or WhatsApp tap on a published storefront or item. Repeats
// from the same browser within a short window are ignored.
export async function recordStorefrontEvent(args: {
  sellerSlug: string;
  itemSlug: string | null;
  postCode?: string | null; // a post page (then itemSlug is ignored)
  sessionId: string;
  type: "VIEW" | "WHATSAPP_CLICK";
  channel: Channel;
  campaignCode: string | null;
}): Promise<boolean> {
  const seller = await findSeller(args.sellerSlug);
  if (!seller || !isPublished(seller)) return false;

  let productId: string | null = null;
  let postId: string | null = null;
  if (args.postCode) {
    const post = await findPublishedPost(seller.id, args.postCode);
    if (!post) return false;
    postId = post.id;
  } else if (args.itemSlug) {
    const item = await db.product.findFirst({
      where: { sellerId: seller.id, slug: args.itemSlug, status: { not: "ARCHIVED" } },
      select: { id: true },
    });
    if (!item) return false;
    productId = item.id;
  }
  const target = postId ? ("POST" as const) : productId ? ("PRODUCT" as const) : ("STOREFRONT" as const);
  const campaign = await findCampaignForStorefront(seller.id, args.campaignCode);

  const seen = await db.attributionEvent.findFirst({
    where: {
      sessionId: args.sessionId,
      sellerId: seller.id,
      target,
      productId,
      postId,
      eventType: args.type,
      occurredAt: { gte: new Date(Date.now() - DEDUPE_MINUTES[args.type] * 60_000) },
    },
    select: { id: true },
  });
  if (seen) return false;
  await db.attributionEvent.create({
    data: {
      sessionId: args.sessionId,
      sellerId: seller.id,
      sellerCampaignId: campaign?.id ?? null,
      productId,
      postId,
      target,
      eventType: args.type,
      channel: args.channel,
    },
  });
  return true;
}

// For /go/wa: the seller's number for a published storefront, plus the
// item name to mention in the greeting. Stays on the server.
export async function getWhatsappTarget(sellerSlug: string, itemSlug: string | null, postCode: string | null = null) {
  const seller = await findSeller(sellerSlug);
  if (!seller || !isPublished(seller) || !seller.whatsappNumber) return null;
  let itemName: string | null = null;
  let fromPost = false;
  if (postCode) {
    fromPost = Boolean(await findPublishedPost(seller.id, postCode));
  } else if (itemSlug && ITEM_SLUG_RE.test(itemSlug)) {
    const item = await db.product.findFirst({
      where: { sellerId: seller.id, slug: itemSlug, status: { not: "ARCHIVED" } },
      select: { name: true },
    });
    itemName = item?.name ?? null;
  }
  return { sellerId: seller.id, businessName: seller.businessName, whatsappNumber: seller.whatsappNumber, itemName, fromPost };
}

// ---------------------------------------------------------------------------
// Proof Posts on the storefront. Only PUBLISHED posts with at least one photo
// are public, and only while the storefront itself is published.
// ---------------------------------------------------------------------------

const publicPostPhotoSelect = { ...publicPhotoSelect, captureSource: true, capturedAt: true } as const;

async function findPublishedPost(sellerId: string, code: string) {
  if (!POST_CODE_RE.test(code)) return null;
  return db.post.findFirst({
    where: { sellerId, code, status: "PUBLISHED", media: { some: {} } },
    select: { id: true },
  });
}

// Grid tiles: newest first, with the first photo and the photo count.
export async function listPublicPosts(sellerId: string, { take, skip = 0 }: { take: number; skip?: number }) {
  const where = { sellerId, status: "PUBLISHED" as const, media: { some: {} } };
  const [posts, total] = await Promise.all([
    db.post.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take,
      skip,
      select: {
        code: true,
        caption: true,
        publishedAt: true,
        media: { orderBy: { position: "asc" }, take: 1, select: { media: { select: publicPhotoSelect } } },
        _count: { select: { media: true } },
      },
    }),
    db.post.count({ where }),
  ]);
  return {
    total,
    posts: posts.map(({ media, _count, ...p }) => ({ ...p, photo: media[0].media, photoCount: _count.media })),
  };
}

export type PublicPostTile = Awaited<ReturnType<typeof listPublicPosts>>["posts"][number];

// A post page. "live" when anyone may see it; "preview" when only the owner
// may (unpublished storefront, or a hidden or draft post).
export async function getStorefrontPost(sellerSlug: string, code: string) {
  if (!POST_CODE_RE.test(code)) return null;
  const seller = await findSeller(sellerSlug);
  if (!seller) return null;
  const post = await db.post.findFirst({
    where: { sellerId: seller.id, code, status: { not: "REMOVED" } },
    select: {
      code: true,
      caption: true,
      status: true,
      publishedAt: true,
      createdAt: true,
      media: { orderBy: { position: "asc" }, select: { media: { select: publicPostPhotoSelect } } },
      // Archived items are never shown as tags.
      products: {
        where: { product: { status: { not: "ARCHIVED" } } },
        orderBy: { product: { name: "asc" } },
        // Public fields only: the item's internal id stays on the server.
        select: { product: { select: { ...publicItemSelect, id: false, photos: photosSelect(1) } } },
      },
    },
  });
  if (!post) return null;
  const live = isPublished(seller) && post.status === "PUBLISHED" && post.media.length > 0;
  return {
    seller,
    state: live ? ("live" as const) : ("preview" as const),
    post: {
      code: post.code,
      caption: post.caption,
      status: post.status,
      postedAt: post.publishedAt ?? post.createdAt,
      photos: post.media.map((m) => m.media),
      products: post.products.slice(0, MAX_POST_TAGS).map((p) => toItem(p.product)),
    },
  };
}

// The collection address and pin, only for a signed-in viewer and only when
// the seller has turned collection on. Never part of toPublicSeller.
export function collectionPoint(seller: SellerRow, signedIn: boolean) {
  if (!seller.offersCollection || !signedIn || !seller.collectionAddress || seller.pinLatitude === null || seller.pinLongitude === null) return null;
  return { address: seller.collectionAddress, pin: { latitude: seller.pinLatitude, longitude: seller.pinLongitude } };
}

// For /go/call: the number to call for a published storefront.
export async function getCallTarget(sellerSlug: string) {
  const seller = await findSeller(sellerSlug);
  if (!seller || !isPublished(seller) || !seller.callNumber) return null;
  return { callNumber: seller.callNumber };
}
