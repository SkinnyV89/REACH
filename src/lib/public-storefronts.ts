import "server-only";
import { db } from "@/lib/db";
import type { Channel, LeadFormInput } from "@/lib/lead-rules";
import { createLeadWithLimits, type SubmitResult } from "@/lib/public-campaigns";
import { ITEM_SLUG_RE, shareCodeOf } from "@/lib/storefront-rules";

// Public storefronts (/s/<seller>) and item pages (/s/<seller>/<item>).
// Reachable by anyone, so every query selects only what a buyer may see.
// A storefront is public only when the seller is active AND has published it.

const SELLER_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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
  instagramUrl: true,
  facebookUrl: true,
  tiktokUrl: true,
  websiteUrl: true,
  createdAt: true,
  place: { select: { name: true, province: true } },
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

function toItem<T extends { price: { toFixed(n: number): string } | null }>(item: T) {
  return { ...item, price: item.price?.toFixed(2) ?? null };
}

// "live": anyone may see it. "unpublished": exists, but only the owner may
// preview it. null: no such storefront.
export async function getStorefront(slug: string) {
  const seller = await findSeller(slug);
  if (!seller) return null;
  const items = await db.product.findMany({
    where: { sellerId: seller.id, status: { not: "ARCHIVED" } },
    orderBy: { updatedAt: "desc" },
    select: publicItemSelect,
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
    select: publicItemSelect,
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

// Enquiry from a published storefront or one of its items.
export async function submitStorefrontLead(
  sellerSlug: string,
  itemSlug: string | null,
  input: LeadFormInput,
  attribution: { channel: Channel; utmSource: string | null; campaignCode: string | null },
  ipHash: string,
): Promise<SubmitResult> {
  const seller = await findSeller(sellerSlug);
  if (!seller) return { ok: false, reason: "not_found" };
  if (!isPublished(seller)) return { ok: false, reason: "unavailable" };

  let productId: string | null = null;
  if (itemSlug) {
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
    source: productId ? "PRODUCT" : "STOREFRONT",
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
  sessionId: string;
  type: "VIEW" | "WHATSAPP_CLICK";
  channel: Channel;
  campaignCode: string | null;
}): Promise<boolean> {
  const seller = await findSeller(args.sellerSlug);
  if (!seller || !isPublished(seller)) return false;

  let productId: string | null = null;
  if (args.itemSlug) {
    const item = await db.product.findFirst({
      where: { sellerId: seller.id, slug: args.itemSlug, status: { not: "ARCHIVED" } },
      select: { id: true },
    });
    if (!item) return false;
    productId = item.id;
  }
  const target = productId ? ("PRODUCT" as const) : ("STOREFRONT" as const);
  const campaign = await findCampaignForStorefront(seller.id, args.campaignCode);

  const seen = await db.attributionEvent.findFirst({
    where: {
      sessionId: args.sessionId,
      sellerId: seller.id,
      target,
      productId,
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
      target,
      eventType: args.type,
      channel: args.channel,
    },
  });
  return true;
}

// For /go/wa: the seller's number for a published storefront, plus the
// item name to mention in the greeting. Stays on the server.
export async function getWhatsappTarget(sellerSlug: string, itemSlug: string | null) {
  const seller = await findSeller(sellerSlug);
  if (!seller || !isPublished(seller) || !seller.whatsappNumber) return null;
  let itemName: string | null = null;
  if (itemSlug && ITEM_SLUG_RE.test(itemSlug)) {
    const item = await db.product.findFirst({
      where: { sellerId: seller.id, slug: itemSlug, status: { not: "ARCHIVED" } },
      select: { name: true },
    });
    itemName = item?.name ?? null;
  }
  return { sellerId: seller.id, businessName: seller.businessName, whatsappNumber: seller.whatsappNumber, itemName };
}
