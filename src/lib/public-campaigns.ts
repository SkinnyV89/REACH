import "server-only";
import { createHmac } from "node:crypto";
import { db } from "@/lib/db";
import { SHARE_LINK_RE } from "@/lib/campaign-rules";
import { LEAD_LIMITS, type Channel, type LeadFormInput } from "@/lib/lead-rules";

// Public, unauthenticated campaign pages. Everything here is reachable by
// anyone with a link, so every query selects only the fields a customer may
// see. Seller ids never leave the server.

const publicSelect = {
  id: true,
  sellerId: true, // server-side only: used for owner preview and lead linking
  status: true,
  headline: true,
  body: true,
  callToAction: true,
  seller: {
    select: { businessName: true, location: true, province: true, whatsappNumber: true, status: true },
  },
  product: { select: { name: true, kind: true, priceType: true, price: true, status: true } },
} as const;

export type PublicCampaign = NonNullable<Awaited<ReturnType<typeof findCampaign>>>;

async function findCampaign(link: string) {
  if (!SHARE_LINK_RE.test(link)) return null;
  return db.sellerCampaign.findUnique({ where: { uniqueLink: link }, select: publicSelect });
}

// "live": published and the seller is active. "unavailable": exists but is
// a draft or paused. null: no such link.
export async function getPublicCampaign(link: string) {
  const campaign = await findCampaign(link);
  if (!campaign) return null;
  const live = campaign.status === "ACTIVE" && campaign.seller.status === "ACTIVE";
  // Archived products are hidden from the public; the advert still works.
  const product =
    campaign.product && campaign.product.status !== "ARCHIVED"
      ? { ...campaign.product, price: campaign.product.price?.toFixed(2) ?? null }
      : null;
  return { ...campaign, product, state: live ? ("live" as const) : ("unavailable" as const) };
}

// The shape handed to client components: no ids, no statuses, no user data.
export function toPublicView(campaign: Awaited<ReturnType<typeof getPublicCampaign>> & object) {
  return {
    headline: campaign.headline,
    body: campaign.body,
    callToAction: campaign.callToAction,
    businessName: campaign.seller.businessName,
    location: campaign.seller.location,
    whatsappNumber: campaign.seller.whatsappNumber,
    product: campaign.product && {
      name: campaign.product.name,
      kind: campaign.product.kind,
      priceType: campaign.product.priceType,
      price: campaign.product.price,
      available: campaign.product.status === "AVAILABLE",
    },
  };
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

// HMAC so stored keys can't be reversed into IP addresses.
export function hashIp(ip: string): string {
  const key = process.env.BETTER_AUTH_SECRET || "reach-dev-only-ip-hash-key";
  return createHmac("sha256", key).update(ip).digest("base64url").slice(0, 32);
}

// Atomic fixed-window counter: returns the count including this request.
export async function hit(key: string, windowMinutes: number): Promise<number> {
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "public_rate_limits" ("key", "count", "window_start")
    VALUES (${key}, 1, now())
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "public_rate_limits"."window_start" < now() - make_interval(mins => ${windowMinutes})
                     THEN 1 ELSE "public_rate_limits"."count" + 1 END,
      "window_start" = CASE WHEN "public_rate_limits"."window_start" < now() - make_interval(mins => ${windowMinutes})
                     THEN now() ELSE "public_rate_limits"."window_start" END
    RETURNING "count"`;
  return Number(rows[0].count);
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------

export type SubmitResult =
  | { ok: true; duplicate: boolean }
  | { ok: false; reason: "not_found" | "unavailable" | "rate_limited" };

// Creates a lead for a live campaign. The seller comes from the campaign
// record; nothing in the request can choose which seller receives it.
export async function submitLead(
  link: string,
  input: LeadFormInput,
  attribution: { channel: Channel; utmSource: string | null },
  ipHash: string,
): Promise<SubmitResult> {
  const campaign = await getPublicCampaign(link);
  if (!campaign) return { ok: false, reason: "not_found" };
  if (campaign.state !== "live") return { ok: false, reason: "unavailable" };

  return createLeadWithLimits({
    sellerId: campaign.sellerId,
    scopeKey: `c:${campaign.id}`,
    sellerCampaignId: campaign.id,
    productId: null,
    source: "CAMPAIGN_PAGE",
    input,
    attribution,
    ipHash,
  });
}

// Shared by campaign pages and storefronts: rate limits (per page and per
// connection), the duplicate guard, and the lead + audit insert. The seller
// is always the one resolved by the caller from a public page, never input.
export async function createLeadWithLimits(args: {
  sellerId: string;
  scopeKey: string; // which public page the limit applies to
  sellerCampaignId: string | null;
  productId: string | null;
  postId?: string | null;
  source: "CAMPAIGN_PAGE" | "STOREFRONT" | "PRODUCT" | "POST";
  input: LeadFormInput;
  attribution: { channel: Channel; utmSource: string | null };
  ipHash: string;
}): Promise<SubmitResult> {
  const { windowMinutes, perCampaign, perIp, duplicateHours } = LEAD_LIMITS;
  const [pageHits, ipHits] = await Promise.all([
    hit(`lead:${args.scopeKey}:${args.ipHash}`, windowMinutes),
    hit(`lead:ip:${args.ipHash}`, windowMinutes),
  ]);
  if (pageHits > perCampaign || ipHits > perIp) return { ok: false, reason: "rate_limited" };

  // Same number to the same seller about the same thing, recently: they already have it.
  const recent = await db.lead.findFirst({
    where: {
      sellerId: args.sellerId,
      contact: args.input.contact,
      ...(args.sellerCampaignId
        ? { sellerCampaignId: args.sellerCampaignId }
        : { productId: args.productId, postId: args.postId ?? null }),
      createdAt: { gte: new Date(Date.now() - duplicateHours * 3600_000) },
    },
    select: { id: true },
  });
  if (recent) return { ok: true, duplicate: true };

  await db.$transaction(async (tx) => {
    const lead = await tx.lead.create({
      data: {
        sellerId: args.sellerId,
        sellerCampaignId: args.sellerCampaignId,
        productId: args.productId,
        postId: args.postId ?? null,
        name: args.input.name,
        contact: args.input.contact,
        message: args.input.message,
        source: args.source,
        channel: args.attribution.channel,
        utmSource: args.attribution.utmSource,
        consentAt: new Date(),
      },
    });
    // Public action: no actor. The entry records that it happened, not who.
    await tx.auditLog.create({ data: { action: "lead.created", entity: "lead", entityId: lead.id } });
  });
  return { ok: true, duplicate: false };
}

// ---------------------------------------------------------------------------
// Anonymous engagement events
// ---------------------------------------------------------------------------

const DEDUPE_MINUTES = { VIEW: 30, WHATSAPP_CLICK: 1 } as const;

// Records a view or WhatsApp click for a live campaign. Repeats from the same
// browser within a short window are ignored, so refreshes don't inflate counts.
export async function recordEvent(
  link: string,
  sessionId: string,
  type: "VIEW" | "WHATSAPP_CLICK",
  channel: Channel,
): Promise<boolean> {
  const campaign = await getPublicCampaign(link);
  if (!campaign || campaign.state !== "live") return false;
  const since = new Date(Date.now() - DEDUPE_MINUTES[type] * 60_000);
  const seen = await db.attributionEvent.findFirst({
    where: { sessionId, sellerCampaignId: campaign.id, eventType: type, occurredAt: { gte: since } },
    select: { id: true },
  });
  if (seen) return false;
  await db.attributionEvent.create({
    data: { sessionId, sellerId: campaign.sellerId, sellerCampaignId: campaign.id, eventType: type, channel },
  });
  return true;
}
