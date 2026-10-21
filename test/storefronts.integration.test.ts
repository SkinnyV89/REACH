// Storefronts, item slugs, storefront enquiries and tracking, against a real
// database. Opt-in: set TEST_DATABASE_URL to a disposable, migrated database.
// It only deletes the users it creates (emails ending -<run tag>@reach-test.invalid).
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const run = describe.skipIf(!url);

run("storefronts (integration)", () => {
  let db: typeof import("@/lib/db").db;
  let storefronts: typeof import("@/lib/storefronts");
  let pub: typeof import("@/lib/public-storefronts");
  let products: typeof import("@/lib/products");
  const tag = Date.now();
  let hairId: string, sowetoId: string;
  type S = { userId: string; sellerId: string; slug: string };
  let A: S, B: S;

  const productInput = (over: Record<string, unknown> = {}) => ({
    kind: "SERVICE" as const,
    name: "Knotless braids",
    categoryId: hairId,
    description: null,
    priceType: "FROM" as const,
    price: "450.00" as string | null,
    availability: "BY_BOOKING" as "BY_BOOKING" | "OUT_OF_STOCK" | "IN_STOCK" | "PRE_ORDER" | "MADE_TO_ORDER",
    leadTimeDays: null as number | null,
    ...over,
  });
  const enquiry = (contact = "+27725550199") => ({ name: "Sipho", contact, message: null, consent: "on" as const });
  const ip = () => `ip-${tag}-${Math.random()}`;
  const storefrontInput = (over: Record<string, unknown> = {}) => ({
    tagline: "Neat braids that last",
    description: "Ten years of braiding in Pimville.",
    placeId: sowetoId,
    areaDetail: "Pimville",
    serviceRadiusKm: 10,
    layout: "PORTFOLIO" as const,
    ...over,
  });

  async function seller(label: string): Promise<S> {
    const user = await db.user.create({ data: { email: `${label}-${tag}@reach-test.invalid`, name: label } });
    const s = await db.seller.create({
      data: {
        userId: user.id,
        slug: `${label}-${tag}`,
        businessName: `${label} Hair`,
        status: "ACTIVE",
        whatsappNumber: "+27821234567",
        fulfilment: ["DELIVERY", "COLLECTION"],
        categories: { create: [{ categoryId: hairId }] },
      },
    });
    return { userId: user.id, sellerId: s.id, slug: s.slug };
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ db } = await import("@/lib/db"));
    storefronts = await import("@/lib/storefronts");
    pub = await import("@/lib/public-storefronts");
    products = await import("@/lib/products");
    hairId = (await db.category.findUniqueOrThrow({ where: { slug: "hair-wigs-weaves" } })).id;
    sowetoId = (await db.place.findUniqueOrThrow({ where: { slug: "soweto-gauteng" } })).id;
    A = await seller("sf-a");
    B = await seller("sf-b");
  });

  afterAll(async () => {
    if (!db) return;
    const users = await db.user.findMany({ where: { email: { endsWith: `-${tag}@reach-test.invalid` } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    const sellers = (await db.seller.findMany({ where: { userId: { in: ids } }, select: { id: true } })).map((s) => s.id);
    const leadIds = (await db.lead.findMany({ where: { sellerId: { in: sellers } }, select: { id: true } })).map((l) => l.id);
    await db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { entityId: { in: leadIds } }] } });
    await db.lead.deleteMany({ where: { sellerId: { in: sellers } } });
    await db.attributionEvent.deleteMany({ where: { sellerId: { in: sellers } } });
    const masters = (await db.sellerCampaign.findMany({ where: { sellerId: { in: sellers } }, select: { masterCampaignId: true } })).map((c) => c.masterCampaignId);
    await db.sellerCampaign.deleteMany({ where: { sellerId: { in: sellers } } });
    await db.masterCampaign.deleteMany({ where: { id: { in: masters } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.publicRateLimit.deleteMany({ where: { key: { contains: `ip-${tag}` } } });
    await db.$disconnect();
  });

  it("has the GeoNames places and the barbers category", async () => {
    expect(await db.place.count()).toBeGreaterThanOrEqual(341);
    expect(await db.place.findUnique({ where: { slug: "soweto-gauteng" } })).toMatchObject({ name: "Soweto", province: "GAUTENG" });
    expect(await db.category.findUnique({ where: { slug: "barbers-mens-grooming" } })).not.toBeNull();
  });

  describe("editing and publishing", () => {
    it("won't publish until the storefront has a place and a listing", async () => {
      await expect(storefronts.setStorefrontPublished(A.userId, A.sellerId, true)).rejects.toMatchObject({ code: "NOT_READY" });
      await expect(storefronts.saveStorefront(A.userId, A.sellerId, storefrontInput({ placeId: crypto.randomUUID() }))).rejects.toMatchObject({
        code: "INVALID_PLACE",
      });
      await storefronts.saveStorefront(A.userId, A.sellerId, storefrontInput());
      await expect(storefronts.setStorefrontPublished(A.userId, A.sellerId, true)).rejects.toMatchObject({ code: "NOT_READY" });
    });

    it("saves only the seller's own storefront and keeps province in step with the place", async () => {
      const a = await db.seller.findUniqueOrThrow({ where: { id: A.sellerId } });
      expect(a).toMatchObject({ placeId: sowetoId, province: "GAUTENG", areaDetail: "Pimville", serviceRadiusKm: 10, tagline: "Neat braids that last" });
      const b = await db.seller.findUniqueOrThrow({ where: { id: B.sellerId } });
      expect(b.placeId).toBeNull();
      expect(b.tagline).toBeNull();
    });

    it("is not public until published, then is, then isn't again", async () => {
      await products.createProduct(A.userId, A.sellerId, productInput());
      expect((await pub.getStorefront(A.slug))?.state).toBe("unpublished");
      await storefronts.setStorefrontPublished(A.userId, A.sellerId, true);
      expect((await pub.getStorefront(A.slug))?.state).toBe("live");
      await storefronts.setStorefrontPublished(A.userId, A.sellerId, false);
      expect((await pub.getStorefront(A.slug))?.state).toBe("unpublished");
      await storefronts.setStorefrontPublished(A.userId, A.sellerId, true);
      // A suspended seller's storefront isn't public even if it was published.
      await db.seller.update({ where: { id: A.sellerId }, data: { status: "ONBOARDING" } });
      expect((await pub.getStorefront(A.slug))?.state).toBe("unpublished");
      await db.seller.update({ where: { id: A.sellerId }, data: { status: "ACTIVE" } });
    });

    it("rejects unsafe or unknown slugs", async () => {
      expect(await pub.getStorefront("../etc/passwd")).toBeNull();
      expect(await pub.getStorefront(`nobody-${tag}`)).toBeNull();
      expect(await pub.getStorefrontItem(A.slug, "../x")).toBeNull();
    });
  });

  describe("public view", () => {
    it("hands the browser no ids, phone number or account details", async () => {
      const sf = (await pub.getStorefront(A.slug))!;
      const view = pub.toPublicSeller(sf.seller);
      const json = JSON.stringify(view);
      for (const secret of [A.sellerId, A.userId, "+27821234567", "821234567", "reach-test.invalid"]) expect(json).not.toContain(secret);
      expect(view).toMatchObject({ businessName: "sf-a Hair", placeName: "Soweto", areaDetail: "Pimville", hasWhatsapp: true });
    });

    it("hides archived items and shows availability", async () => {
      const p = await products.createProduct(A.userId, A.sellerId, productInput({ name: "Cornrows", availability: "OUT_OF_STOCK" }));
      let items = (await pub.getStorefront(A.slug))!.items;
      expect(items.find((i) => i.slug === "cornrows")).toMatchObject({ availability: "OUT_OF_STOCK", price: "450.00" });
      await products.setArchived(A.userId, A.sellerId, p.id, true);
      items = (await pub.getStorefront(A.slug))!.items;
      expect(items.some((i) => i.slug === "cornrows")).toBe(false);
      expect(await pub.getStorefrontItem(A.slug, "cornrows")).toBeNull();
    });
  });

  describe("item slugs", () => {
    it("numbers duplicates and redirects old slugs after a rename", async () => {
      const first = await products.createProduct(A.userId, A.sellerId, productInput({ name: "Fade" }));
      const second = await products.createProduct(A.userId, A.sellerId, productInput({ name: "Fade" }));
      expect([first.slug, second.slug]).toEqual(["fade", "fade-2"]);

      await products.updateProduct(A.userId, A.sellerId, first.id, productInput({ name: "Skin fade" }));
      expect((await db.product.findUniqueOrThrow({ where: { id: first.id } })).slug).toBe("skin-fade");
      expect(await pub.getStorefrontItem(A.slug, "fade")).toEqual({ kind: "redirect", to: `/s/${A.slug}/skin-fade` });

      // A new item can't take an address that still redirects elsewhere.
      const third = await products.createProduct(A.userId, A.sellerId, productInput({ name: "Fade" }));
      expect(third.slug).toBe("fade-3");

      // Renaming back reclaims the old address.
      await products.updateProduct(A.userId, A.sellerId, first.id, productInput({ name: "Fade" }));
      expect((await db.product.findUniqueOrThrow({ where: { id: first.id } })).slug).toBe("fade");
      expect((await pub.getStorefrontItem(A.slug, "skin-fade"))).toEqual({ kind: "redirect", to: `/s/${A.slug}/fade` });
      expect((await pub.getStorefrontItem(A.slug, "fade"))?.kind).toBe("item");
    });

    it("updates the availability date only when availability changes", async () => {
      const p = await products.createProduct(A.userId, A.sellerId, productInput({ name: "Twists" }));
      const old = new Date("2026-01-01");
      await db.product.update({ where: { id: p.id }, data: { availabilityUpdatedAt: old } });
      await products.updateProduct(A.userId, A.sellerId, p.id, productInput({ name: "Twists", price: "500.00" }));
      expect((await db.product.findUniqueOrThrow({ where: { id: p.id } })).availabilityUpdatedAt).toEqual(old);
      await products.updateProduct(A.userId, A.sellerId, p.id, productInput({ name: "Twists", availability: "OUT_OF_STOCK" }));
      const after = await db.product.findUniqueOrThrow({ where: { id: p.id } });
      expect(after.availabilityUpdatedAt.getTime()).toBeGreaterThan(old.getTime());
      expect(after.status).toBe("UNAVAILABLE");
    });

    it("item slugs are per seller", async () => {
      const b = await products.createProduct(B.userId, B.sellerId, productInput({ name: "Fade" }));
      expect(b.slug).toBe("fade");
    });
  });

  describe("enquiries from storefronts", () => {
    it("refuses enquiries to an unpublished storefront", async () => {
      expect(await pub.submitStorefrontLead(B.slug, null, enquiry(), { channel: "UNKNOWN", utmSource: null, campaignCode: null }, ip())).toEqual({
        ok: false,
        reason: "unavailable",
      });
    });

    it("creates storefront and item leads for the right seller", async () => {
      expect((await pub.submitStorefrontLead(A.slug, null, enquiry(), { channel: "WHATSAPP", utmSource: "whatsapp", campaignCode: null }, ip())).ok).toBe(true);
      expect((await pub.submitStorefrontLead(A.slug, "fade", enquiry(), { channel: "UNKNOWN", utmSource: null, campaignCode: null }, ip())).ok).toBe(true);
      const leads = await db.lead.findMany({ where: { contact: "+27725550199", sellerId: A.sellerId }, orderBy: { createdAt: "asc" } });
      expect(leads.map((l) => [l.source, l.channel, l.productId !== null])).toEqual([
        ["STOREFRONT", "WHATSAPP", false],
        ["PRODUCT", "UNKNOWN", true],
      ]);
      expect(await db.lead.count({ where: { sellerId: B.sellerId } })).toBe(0);
    });

    it("doesn't save the same enquiry twice in a day, per item", async () => {
      const again = await pub.submitStorefrontLead(A.slug, "fade", enquiry(), { channel: "UNKNOWN", utmSource: null, campaignCode: null }, ip());
      expect(again).toEqual({ ok: true, duplicate: true });
      const other = await pub.submitStorefrontLead(A.slug, "twists", enquiry(), { channel: "UNKNOWN", utmSource: null, campaignCode: null }, ip());
      expect(other).toEqual({ ok: true, duplicate: false });
    });

    it("rejects an unknown item", async () => {
      expect(await pub.submitStorefrontLead(A.slug, "nope", enquiry("+27725550000"), { channel: "UNKNOWN", utmSource: null, campaignCode: null }, ip())).toEqual({
        ok: false,
        reason: "not_found",
      });
    });

    it("credits a published campaign of this seller from ?c=, and nobody else's", async () => {
      const master = await db.masterCampaign.create({
        data: { categoryId: hairId, title: `sf-${tag}`, objective: "o", headline: "h", body: "b", callToAction: "c", source: "TEMPLATE" },
      });
      const mk = (sellerId: string, code: string, status: "ACTIVE" | "DRAFT") =>
        db.sellerCampaign.create({
          data: { sellerId, masterCampaignId: master.id, uniqueLink: `x-${tag}-${code}`, headline: "Meet us", body: "b", callToAction: "Chat", status, destination: "STOREFRONT" },
        });
      const mine = await mk(A.sellerId, "AbCdEfGh", "ACTIVE");
      await mk(B.sellerId, "HgFeDcBa", "ACTIVE");

      await pub.submitStorefrontLead(A.slug, null, enquiry("+27725551111"), { channel: "FACEBOOK", utmSource: "facebook", campaignCode: "AbCdEfGh" }, ip());
      await pub.submitStorefrontLead(A.slug, null, enquiry("+27725552222"), { channel: "FACEBOOK", utmSource: "facebook", campaignCode: "HgFeDcBa" }, ip());
      const credited = await db.lead.findFirstOrThrow({ where: { contact: "+27725551111" } });
      const notCredited = await db.lead.findFirstOrThrow({ where: { contact: "+27725552222" } });
      expect(credited.sellerCampaignId).toBe(mine.id);
      expect(notCredited.sellerCampaignId).toBeNull(); // B's code on A's storefront credits nothing
      expect(await pub.findCampaignForStorefront(A.sellerId, "AbCdEfGh")).toMatchObject({ id: mine.id, headline: "Meet us" });
      await db.sellerCampaign.update({ where: { id: mine.id }, data: { status: "PAUSED" } });
      expect(await pub.findCampaignForStorefront(A.sellerId, "AbCdEfGh")).toBeNull();
    });
  });

  describe("tracking and WhatsApp", () => {
    it("records storefront and item views once per visitor, only when published", async () => {
      const v = crypto.randomUUID();
      const base = { sellerSlug: A.slug, sessionId: v, type: "VIEW" as const, channel: "WHATSAPP" as const, campaignCode: null };
      expect(await pub.recordStorefrontEvent({ ...base, itemSlug: null })).toBe(true);
      expect(await pub.recordStorefrontEvent({ ...base, itemSlug: null })).toBe(false);
      expect(await pub.recordStorefrontEvent({ ...base, itemSlug: "fade" })).toBe(true);
      expect(await pub.recordStorefrontEvent({ ...base, sellerSlug: B.slug, itemSlug: null })).toBe(false); // B unpublished
      const events = await db.attributionEvent.findMany({ where: { sessionId: v }, select: { target: true, productId: true } });
      expect(events.map((e) => e.target).sort()).toEqual(["PRODUCT", "STOREFRONT"]);
    });

    it("gives /go/wa the number only for a published storefront, with the item name", async () => {
      expect(await pub.getWhatsappTarget(A.slug, "fade")).toMatchObject({ whatsappNumber: "+27821234567", itemName: "Fade" });
      expect((await pub.getWhatsappTarget(A.slug, null))?.itemName).toBeNull();
      expect(await pub.getWhatsappTarget(B.slug, null)).toBeNull();
    });
  });
});
