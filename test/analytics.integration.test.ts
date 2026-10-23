// Seller analytics against a real database, with known events and leads.
// Opt-in: set TEST_DATABASE_URL to a disposable, migrated database.
// It only deletes the users it creates (emails ending -<run tag>@reach-test.invalid).
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const run = describe.skipIf(!url);

run("analytics (integration)", () => {
  let db: typeof import("@/lib/db").db;
  let analytics: typeof import("@/lib/analytics");
  const tag = Date.now();
  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
  let hairId: string;
  type S = { userId: string; sellerId: string; campaigns: string[] };
  let A: S, B: S;

  async function seller(label: string, campaignCount: number): Promise<S> {
    const user = await db.user.create({ data: { email: `${label}-${tag}@reach-test.invalid`, name: label } });
    const s = await db.seller.create({
      data: { userId: user.id, slug: `${label}-${tag}`, businessName: label, status: "ACTIVE", whatsappNumber: "+27821234567" },
    });
    const campaigns: string[] = [];
    for (let i = 0; i < campaignCount; i++) {
      const master = await db.masterCampaign.create({
        data: { categoryId: hairId, title: `${label} master ${i}`, objective: "o", headline: "h", body: "b", callToAction: "c", source: "TEMPLATE" },
      });
      const c = await db.sellerCampaign.create({
        data: {
          sellerId: s.id,
          masterCampaignId: master.id,
          uniqueLink: `${label}-${tag}-${i}AbCdEfG`,
          headline: `${label} campaign ${i}`,
          body: "b",
          callToAction: "c",
          status: "ACTIVE",
        },
      });
      campaigns.push(c.id);
    }
    return { userId: user.id, sellerId: s.id, campaigns };
  }

  type Ev = { campaign: string; type: "VIEW" | "WHATSAPP_CLICK"; channel: "WHATSAPP" | "FACEBOOK" | "INSTAGRAM" | "TIKTOK" | "UNKNOWN"; ago: number };
  async function events(s: S, list: Ev[]) {
    await db.attributionEvent.createMany({
      data: list.map((e) => ({
        sessionId: crypto.randomUUID(),
        sellerId: s.sellerId,
        sellerCampaignId: e.campaign,
        eventType: e.type,
        channel: e.channel,
        occurredAt: daysAgo(e.ago),
      })),
    });
  }
  type L = { campaign: string; channel: Ev["channel"]; ago: number; status?: "NEW" | "CONVERTED" };
  async function leadsFor(s: S, list: L[]) {
    await db.lead.createMany({
      data: list.map((l, i) => ({
        sellerId: s.sellerId,
        sellerCampaignId: l.campaign,
        name: `Lead ${i}`,
        contact: `+2772${tag % 1000000}${i}`.slice(0, 12),
        source: "CAMPAIGN_PAGE",
        channel: l.channel,
        consentAt: daysAgo(l.ago),
        createdAt: daysAgo(l.ago),
        status: l.status ?? "NEW",
      })),
    });
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ db } = await import("@/lib/db"));
    analytics = await import("@/lib/analytics");
    hairId = (await db.category.findUniqueOrThrow({ where: { slug: "hair-wigs-weaves" } })).id;
    A = await seller("ana-a", 2);
    B = await seller("ana-b", 1);
    const [a0, a1] = A.campaigns;
    // Seller A, within the last 30 days
    await events(A, [
      { campaign: a0, type: "VIEW", channel: "FACEBOOK", ago: 1 },
      { campaign: a0, type: "VIEW", channel: "FACEBOOK", ago: 2 },
      { campaign: a0, type: "VIEW", channel: "WHATSAPP", ago: 3 },
      { campaign: a0, type: "WHATSAPP_CLICK", channel: "FACEBOOK", ago: 1 },
      { campaign: a1, type: "VIEW", channel: "TIKTOK", ago: 5 },
      { campaign: a1, type: "VIEW", channel: "UNKNOWN", ago: 6 },
      // older than 30 days, inside 90
      { campaign: a1, type: "VIEW", channel: "TIKTOK", ago: 45 },
      { campaign: a1, type: "WHATSAPP_CLICK", channel: "TIKTOK", ago: 45 },
    ]);
    await leadsFor(A, [
      { campaign: a0, channel: "FACEBOOK", ago: 1, status: "CONVERTED" },
      { campaign: a0, channel: "FACEBOOK", ago: 2 },
      { campaign: a1, channel: "UNKNOWN", ago: 4 },
      { campaign: a1, channel: "TIKTOK", ago: 50 },
    ]);
    // Seller B: lots of activity that must never show up in A's numbers
    await events(B, Array.from({ length: 20 }, () => ({ campaign: B.campaigns[0], type: "VIEW" as const, channel: "INSTAGRAM" as const, ago: 1 })));
    await leadsFor(B, [{ campaign: B.campaigns[0], channel: "INSTAGRAM", ago: 1 }]);
  });

  afterAll(async () => {
    if (!db) return;
    const users = await db.user.findMany({ where: { email: { endsWith: `-${tag}@reach-test.invalid` } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    const sellers = (await db.seller.findMany({ where: { userId: { in: ids } }, select: { id: true } })).map((s) => s.id);
    await db.lead.deleteMany({ where: { sellerId: { in: sellers } } });
    await db.attributionEvent.deleteMany({ where: { sellerId: { in: sellers } } });
    const masters = (await db.sellerCampaign.findMany({ where: { sellerId: { in: sellers } }, select: { masterCampaignId: true } })).map((c) => c.masterCampaignId);
    await db.sellerCampaign.deleteMany({ where: { sellerId: { in: sellers } } });
    await db.masterCampaign.deleteMany({ where: { id: { in: masters } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  it("counts the funnel for the last 30 days", async () => {
    const a = await analytics.getSellerAnalytics(A.sellerId, 30, now);
    expect(a.funnel).toEqual({ views: 5, clicks: 1, leads: 3, converted: 1 });
    expect(a.hasData).toBe(true);
  });

  it("widens with the period", async () => {
    expect((await analytics.getSellerAnalytics(A.sellerId, 90, now)).funnel).toEqual({ views: 6, clicks: 2, leads: 4, converted: 1 });
    expect((await analytics.getSellerAnalytics(A.sellerId, null, now)).funnel.leads).toBe(4);
    // The oldest seeded data is exactly 1 day old; half a day back finds none.
    expect((await analytics.getSellerAnalytics(A.sellerId, 0.5, now)).funnel).toMatchObject({ views: 0, leads: 0 });
  });

  it("breaks down every channel, including zeros and Unknown", async () => {
    const a = await analytics.getSellerAnalytics(A.sellerId, 30, now);
    const byChannel = Object.fromEntries(a.channels.map((c) => [c.channel, { views: c.views, clicks: c.clicks, leads: c.leads }]));
    expect(byChannel).toEqual({
      WHATSAPP: { views: 1, clicks: 0, leads: 0 },
      FACEBOOK: { views: 2, clicks: 1, leads: 2 },
      INSTAGRAM: { views: 0, clicks: 0, leads: 0 },
      TIKTOK: { views: 1, clicks: 0, leads: 0 },
      REACH: { views: 0, clicks: 0, leads: 0 },
      UNKNOWN: { views: 1, clicks: 0, leads: 1 },
    });
  });

  it("compares campaigns, best first, with their master campaign", async () => {
    const a = await analytics.getSellerAnalytics(A.sellerId, 30, now);
    expect(a.campaigns.map((c) => [c.headline, c.masterTitle, c.views, c.clicks, c.leads, c.converted])).toEqual([
      ["ana-a campaign 0", "ana-a master 0", 3, 1, 2, 1],
      ["ana-a campaign 1", "ana-a master 1", 2, 0, 1, 0],
    ]);
  });

  it("never mixes in another seller's data", async () => {
    const a = await analytics.getSellerAnalytics(A.sellerId, null, now);
    expect(a.channels.find((c) => c.channel === "INSTAGRAM")).toMatchObject({ views: 0, leads: 0 });
    expect(a.campaigns.some((c) => B.campaigns.includes(c.id))).toBe(false);
    const b = await analytics.getSellerAnalytics(B.sellerId, null, now);
    expect(b.funnel).toEqual({ views: 20, clicks: 0, leads: 1, converted: 0 });
    expect(b.campaigns.map((c) => c.id)).toEqual(B.campaigns);
  });

  it("states highlights from the real numbers", async () => {
    const a = await analytics.getSellerAnalytics(A.sellerId, 30, now);
    expect(analytics.describeHighlights(a)).toEqual([
      "Most enquiries came from Facebook: 2 of 3.",
      "1 of 3 enquiries came through a link without a channel tag. Use the per-channel links on each campaign to see where those come from.",
      '"ana-a campaign 0" has the most enquiries (2).',
    ]);
  });

  it("drops deleted leads from the numbers", async () => {
    const lead = await db.lead.findFirstOrThrow({ where: { sellerId: A.sellerId, channel: "UNKNOWN" } });
    const { deleteLead } = await import("@/lib/leads");
    await deleteLead(A.userId, A.sellerId, lead.id);
    expect((await analytics.getSellerAnalytics(A.sellerId, 30, now)).funnel.leads).toBe(2);
    await db.auditLog.deleteMany({ where: { entityId: lead.id } });
  });
});
