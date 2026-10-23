import "server-only";
import { db } from "@/lib/db";
import { CHANNELS, type Channel } from "@/lib/lead-rules";

// Seller analytics from data REACH actually records: anonymous page views
// and WhatsApp taps (attribution_events) and enquiries (leads). Nothing is
// estimated or provider-reported. Every query is scoped by the seller id.

export const PERIODS = [
  { key: "7d", label: "7 days", days: 7 },
  { key: "30d", label: "30 days", days: 30 },
  { key: "90d", label: "90 days", days: 90 },
  { key: "all", label: "All time", days: null },
] as const;
export type PeriodKey = (typeof PERIODS)[number]["key"];

export function parsePeriod(raw: string | string[] | undefined): (typeof PERIODS)[number] {
  const key = Array.isArray(raw) ? raw[0] : raw;
  return PERIODS.find((p) => p.key === key) ?? PERIODS[1];
}

// A ratio, or null when there's nothing to divide by (shown as "—", never 0%).
export function rate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

export function formatRate(value: number | null): string {
  if (value === null) return "—";
  const pct = value * 100;
  return `${pct >= 10 || pct === 0 ? Math.round(pct) : pct.toFixed(1)}%`;
}

type Counts = { views: number; clicks: number; leads: number };
const zero = (): Counts => ({ views: 0, clicks: 0, leads: 0 });

export const CHANNEL_ORDER: Channel[] = ["WHATSAPP", "FACEBOOK", "INSTAGRAM", "TIKTOK", "REACH", "UNKNOWN"];

export async function getSellerAnalytics(sellerId: string, days: number | null, now = new Date()) {
  const since = days === null ? undefined : new Date(now.getTime() - days * 86_400_000);
  const eventWhere = { sellerId, ...(since ? { occurredAt: { gte: since } } : {}) };
  const leadWhere = { sellerId, ...(since ? { createdAt: { gte: since } } : {}) };

  const [eventsByChannel, eventsByCampaign, leadsByChannel, leadsByCampaign, campaigns] = await Promise.all([
    db.attributionEvent.groupBy({ by: ["eventType", "channel"], where: eventWhere, _count: { _all: true } }),
    db.attributionEvent.groupBy({ by: ["sellerCampaignId", "eventType"], where: eventWhere, _count: { _all: true } }),
    db.lead.groupBy({ by: ["channel"], where: leadWhere, _count: { _all: true } }),
    db.lead.groupBy({ by: ["sellerCampaignId", "status"], where: leadWhere, _count: { _all: true } }),
    db.sellerCampaign.findMany({
      where: { sellerId },
      select: {
        id: true,
        headline: true,
        status: true,
        masterCampaign: { select: { title: true, source: true, category: { select: { name: true } } } },
      },
    }),
  ]);

  // Channels: every channel is listed, even at zero, so the breakdown is complete.
  const channels = new Map<Channel, Counts>(CHANNEL_ORDER.map((c) => [c, zero()]));
  for (const row of eventsByChannel) {
    const c = channels.get(row.channel)!;
    if (row.eventType === "VIEW") c.views += row._count._all;
    else c.clicks += row._count._all;
  }
  for (const row of leadsByChannel) channels.get(row.channel)!.leads += row._count._all;

  // Campaigns.
  const perCampaign = new Map<string, Counts & { converted: number }>(
    campaigns.map((c) => [c.id, { ...zero(), converted: 0 }]),
  );
  for (const row of eventsByCampaign) {
    const c = row.sellerCampaignId ? perCampaign.get(row.sellerCampaignId) : undefined;
    if (!c) continue;
    if (row.eventType === "VIEW") c.views += row._count._all;
    else c.clicks += row._count._all;
  }
  let converted = 0;
  for (const row of leadsByCampaign) {
    if (row.status === "CONVERTED") converted += row._count._all;
    const c = row.sellerCampaignId ? perCampaign.get(row.sellerCampaignId) : undefined;
    if (!c) continue;
    c.leads += row._count._all;
    if (row.status === "CONVERTED") c.converted += row._count._all;
  }

  const channelRows = CHANNEL_ORDER.map((channel) => ({ channel, label: CHANNELS[channel], ...channels.get(channel)! }));
  const funnel = channelRows.reduce(
    (t, r) => ({ views: t.views + r.views, clicks: t.clicks + r.clicks, leads: t.leads + r.leads }),
    zero(),
  );

  const campaignRows = campaigns
    .map((c) => ({
      id: c.id,
      headline: c.headline,
      status: c.status,
      masterTitle: c.masterCampaign.title,
      category: c.masterCampaign.category.name,
      source: c.masterCampaign.source,
      ...perCampaign.get(c.id)!,
    }))
    .sort((a, b) => b.leads - a.leads || b.clicks - a.clicks || b.views - a.views || a.headline.localeCompare(b.headline));

  return {
    funnel: { ...funnel, converted },
    channels: channelRows,
    campaigns: campaignRows,
    hasData: funnel.views + funnel.clicks + funnel.leads > 0,
  };
}

export type SellerAnalytics = Awaited<ReturnType<typeof getSellerAnalytics>>;

// Plain statements of fact from the data, only when there is data behind
// them. No advice or predictions.
export function describeHighlights(a: SellerAnalytics): string[] {
  const out: string[] = [];
  const total = a.funnel.leads;
  const known = a.channels.filter((c) => c.channel !== "UNKNOWN" && c.leads > 0).sort((x, y) => y.leads - x.leads);
  if (total > 0 && known.length > 0) {
    const top = known[0];
    const tied = known.filter((c) => c.leads === top.leads);
    out.push(
      tied.length > 1
        ? `${tied.map((c) => c.label).join(" and ")} brought in the most enquiries (${top.leads} each).`
        : `Most enquiries came from ${top.label}: ${top.leads} of ${total}.`,
    );
  }
  const unknown = a.channels.find((c) => c.channel === "UNKNOWN")!;
  if (total > 0 && unknown.leads > 0) {
    out.push(
      `${unknown.leads} of ${total} enquiries came through a link without a channel tag. Use the per-channel links on each campaign to see where those come from.`,
    );
  }
  const best = a.campaigns.find((c) => c.leads > 0);
  if (best && a.campaigns.filter((c) => c.leads > 0).length > 1) {
    out.push(`"${best.headline}" has the most enquiries (${best.leads}).`);
  }
  return out;
}
