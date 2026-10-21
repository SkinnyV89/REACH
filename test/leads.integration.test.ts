// Public campaign pages, lead capture, tracking and seller lead privacy,
// against a real database.
// Opt-in: set TEST_DATABASE_URL to a disposable, migrated database.
// It only deletes the users it creates (emails ending -<run tag>@reach-test.invalid).
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const run = describe.skipIf(!url);

run("public pages and leads (integration)", () => {
  let db: typeof import("@/lib/db").db;
  let pub: typeof import("@/lib/public-campaigns");
  let leads: typeof import("@/lib/leads");
  let campaigns: typeof import("@/lib/campaigns");
  const tag = Date.now();
  type S = { userId: string; sellerId: string; campaignId: string; link: string };
  let A: S, B: S;
  let hairId: string;

  const enquiry = (over: Record<string, unknown> = {}) => ({
    name: "Sipho",
    contact: "+27725550199",
    message: "Do you have 22 inch?",
    consent: "on" as const,
    ...over,
  });
  const ip = () => `ip-${tag}-${Math.random()}`;

  async function makeSellerWithCampaign(label: string, status: "DRAFT" | "ACTIVE" | "PAUSED"): Promise<S> {
    const user = await db.user.create({
      data: { email: `${label}-${tag}@reach-test.invalid`, name: label },
    });
    const seller = await db.seller.create({
      data: {
        userId: user.id,
        slug: `${label}-${tag}`,
        businessName: `${label} Hair`,
        whatsappNumber: "+27821234567",
        location: "Soweto",
        status: "ACTIVE",
        categories: { create: [{ categoryId: hairId }] },
      },
    });
    const master = await db.masterCampaign.create({
      data: { categoryId: hairId, title: `t-${tag}`, objective: "o", headline: "h {{business_name}}", body: "b", callToAction: "Message us", source: "TEMPLATE" },
    });
    const product = await db.product.create({
      data: { sellerId: seller.id, categoryId: hairId, name: "Body wave", slug: "body-wave", price: "1250.00" },
    });
    const link = `${label}-${tag}-AbCdEfGh`;
    const campaign = await db.sellerCampaign.create({
      data: {
        sellerId: seller.id,
        masterCampaignId: master.id,
        productId: product.id,
        uniqueLink: link,
        headline: `Meet ${label} Hair`,
        body: "Body copy",
        callToAction: "Message us on WhatsApp",
        status,
      },
    });
    return { userId: user.id, sellerId: seller.id, campaignId: campaign.id, link };
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ db } = await import("@/lib/db"));
    pub = await import("@/lib/public-campaigns");
    leads = await import("@/lib/leads");
    campaigns = await import("@/lib/campaigns");
    hairId = (await db.category.findUniqueOrThrow({ where: { slug: "hair-wigs-weaves" } })).id;
    A = await makeSellerWithCampaign("leads-a", "ACTIVE");
    B = await makeSellerWithCampaign("leads-b", "ACTIVE");
  });

  afterAll(async () => {
    if (!db) return;
    const users = await db.user.findMany({ where: { email: { endsWith: `-${tag}@reach-test.invalid` } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    const sellers = (await db.seller.findMany({ where: { userId: { in: ids } }, select: { id: true } })).map((s) => s.id);
    const leadIds = (await db.lead.findMany({ where: { sellerId: { in: sellers } }, select: { id: true } })).map((l) => l.id);
    await db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { entityId: { in: leadIds } }] } });
    await db.lead.deleteMany({ where: { sellerId: { in: sellers } } });
    const masters = (await db.sellerCampaign.findMany({ where: { sellerId: { in: sellers } }, select: { masterCampaignId: true } })).map((c) => c.masterCampaignId);
    await db.sellerCampaign.deleteMany({ where: { sellerId: { in: sellers } } });
    await db.masterCampaign.deleteMany({ where: { id: { in: masters } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.publicRateLimit.deleteMany({ where: { key: { contains: `ip-${tag}` } } });
    await db.$disconnect();
  });

  describe("public campaign lookup", () => {
    it("returns null for malformed or unknown links", async () => {
      expect(await pub.getPublicCampaign("../../etc/passwd")).toBeNull();
      expect(await pub.getPublicCampaign(`nobody-${tag}-AbCdEfGh`)).toBeNull();
    });

    it("is live only when published", async () => {
      expect((await pub.getPublicCampaign(A.link))?.state).toBe("live");
      await db.sellerCampaign.update({ where: { id: A.campaignId }, data: { status: "DRAFT" } });
      expect((await pub.getPublicCampaign(A.link))?.state).toBe("unavailable");
      await db.sellerCampaign.update({ where: { id: A.campaignId }, data: { status: "PAUSED" } });
      expect((await pub.getPublicCampaign(A.link))?.state).toBe("unavailable");
      await db.sellerCampaign.update({ where: { id: A.campaignId }, data: { status: "ACTIVE" } });
    });

    it("hands the browser only public fields", async () => {
      const view = pub.toPublicView((await pub.getPublicCampaign(A.link))!);
      expect(Object.keys(view).sort()).toEqual(
        ["body", "businessName", "callToAction", "headline", "location", "product", "whatsappNumber"].sort(),
      );
      const serialised = JSON.stringify(view);
      for (const secret of [A.sellerId, A.userId, A.campaignId, "reach-test.invalid"]) {
        expect(serialised).not.toContain(secret);
      }
      expect(view.product).toMatchObject({ name: "Body wave", price: "1250.00", available: true });
    });

    it("hides an archived featured product", async () => {
      const campaign = await db.sellerCampaign.findUniqueOrThrow({ where: { id: B.campaignId } });
      await db.product.update({ where: { id: campaign.productId! }, data: { status: "ARCHIVED" } });
      expect((await pub.getPublicCampaign(B.link))?.product).toBeNull();
      await db.product.update({ where: { id: campaign.productId! }, data: { status: "AVAILABLE" } });
    });
  });

  describe("lead capture", () => {
    it("creates a lead linked to the right campaign and seller", async () => {
      const result = await pub.submitLead(A.link, enquiry(), { channel: "FACEBOOK", utmSource: "facebook" }, ip());
      expect(result).toEqual({ ok: true, duplicate: false });
      const lead = await db.lead.findFirstOrThrow({ where: { sellerCampaignId: A.campaignId } });
      expect(lead).toMatchObject({
        sellerId: A.sellerId,
        name: "Sipho",
        contact: "+27725550199",
        status: "NEW",
        source: "CAMPAIGN_PAGE",
        channel: "FACEBOOK",
        utmSource: "facebook",
      });
      expect(lead.consentAt).toBeInstanceOf(Date);
    });

    it("doesn't save the same number on the same campaign twice within a day", async () => {
      const result = await pub.submitLead(A.link, enquiry({ message: "again" }), { channel: "UNKNOWN", utmSource: null }, ip());
      expect(result).toEqual({ ok: true, duplicate: true });
      expect(await db.lead.count({ where: { sellerCampaignId: A.campaignId, contact: "+27725550199" } })).toBe(1);
    });

    it("refuses enquiries for unpublished campaigns", async () => {
      await db.sellerCampaign.update({ where: { id: B.campaignId }, data: { status: "PAUSED" } });
      expect(await pub.submitLead(B.link, enquiry(), { channel: "UNKNOWN", utmSource: null }, ip())).toEqual({
        ok: false,
        reason: "unavailable",
      });
      await db.sellerCampaign.update({ where: { id: B.campaignId }, data: { status: "ACTIVE" } });
      expect(await pub.submitLead(`x-${tag}-AbCdEfGh`, enquiry(), { channel: "UNKNOWN", utmSource: null }, ip())).toEqual({
        ok: false,
        reason: "not_found",
      });
    });

    it("rate limits repeated enquiries from one connection", async () => {
      const sameIp = ip();
      const results = [];
      for (let i = 0; i < 6; i++) {
        results.push(await pub.submitLead(B.link, enquiry({ contact: `+2772555${String(1000 + i)}` }), { channel: "UNKNOWN", utmSource: null }, sameIp));
      }
      expect(results.slice(0, 5).every((r) => r.ok)).toBe(true);
      expect(results[5]).toEqual({ ok: false, reason: "rate_limited" });
      // a different connection is unaffected
      expect((await pub.submitLead(B.link, enquiry({ contact: "+27725552000" }), { channel: "UNKNOWN", utmSource: null }, ip())).ok).toBe(true);
    });

    it("hashes IPs so stored keys can't be read back", () => {
      const h = pub.hashIp("196.25.1.1");
      expect(h).not.toContain("196");
      expect(h).toBe(pub.hashIp("196.25.1.1"));
      expect(h).not.toBe(pub.hashIp("196.25.1.2"));
    });
  });

  describe("seller privacy", () => {
    it("lists only the seller's own leads", async () => {
      const aLeads = await leads.listLeads(A.sellerId);
      const bLeads = await leads.listLeads(B.sellerId);
      expect(aLeads.length).toBeGreaterThan(0);
      expect(aLeads.every((l) => l.sellerCampaign?.id === A.campaignId)).toBe(true);
      expect(bLeads.some((l) => aLeads.find((a) => a.id === l.id))).toBe(false);
      expect((await leads.countLeadsByStatus(A.sellerId)).total).toBe(aLeads.length);
    });

    it("won't let seller B change seller A's lead", async () => {
      const [lead] = await leads.listLeads(A.sellerId);
      await expect(leads.updateLeadStatus(B.userId, B.sellerId, lead.id, "LOST")).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("NEW");
    });

    it("lets the owner move a lead through statuses, with an audit trail", async () => {
      const [lead] = await leads.listLeads(A.sellerId);
      for (const status of ["CONTACTED", "QUALIFIED", "CONVERTED"] as const) {
        await leads.updateLeadStatus(A.userId, A.sellerId, lead.id, status);
      }
      expect((await db.lead.findUniqueOrThrow({ where: { id: lead.id } })).status).toBe("CONVERTED");
      expect(await leads.listLeads(A.sellerId, "CONVERTED")).toHaveLength(1);
      const audit = await db.auditLog.findMany({ where: { entityId: lead.id }, orderBy: { createdAt: "asc" } });
      expect(audit.map((a) => a.action)).toEqual(["lead.created", "lead.status_contacted", "lead.status_qualified", "lead.status_converted"]);
    });

    it("won't let seller B publish or pause seller A's campaign", async () => {
      await expect(campaigns.setSellerCampaignStatus(B.userId, B.sellerId, A.campaignId, "PAUSED")).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      expect((await db.sellerCampaign.findUniqueOrThrow({ where: { id: A.campaignId } })).status).toBe("ACTIVE");
    });
  });

  describe("deleting leads (POPIA requests)", () => {
    it("won't let seller B delete seller A's lead", async () => {
      const [lead] = await leads.listLeads(A.sellerId);
      await expect(leads.deleteLead(B.userId, B.sellerId, lead.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(await db.lead.findUnique({ where: { id: lead.id } })).not.toBeNull();
    });

    it("lets the owner delete permanently, audited without personal details", async () => {
      await pub.submitLead(A.link, enquiry({ name: "Delete Me", contact: "+27725559999" }), { channel: "UNKNOWN", utmSource: null }, ip());
      const lead = await db.lead.findFirstOrThrow({ where: { contact: "+27725559999" } });
      await leads.deleteLead(A.userId, A.sellerId, lead.id);
      expect(await db.lead.findUnique({ where: { id: lead.id } })).toBeNull();
      const entry = await db.auditLog.findFirstOrThrow({ where: { entityId: lead.id, action: "lead.deleted" } });
      expect(entry.actorId).toBe(A.userId);
      expect(JSON.stringify(entry)).not.toMatch(/Delete Me|27725559999/);
      // deleting again reports not found rather than pretending
      await expect(leads.deleteLead(A.userId, A.sellerId, lead.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("deletes a person's leads across sellers for requests sent to REACH", async () => {
      const contact = "+27725558888";
      await pub.submitLead(A.link, enquiry({ contact }), { channel: "UNKNOWN", utmSource: null }, ip());
      await pub.submitLead(B.link, enquiry({ contact }), { channel: "UNKNOWN", utmSource: null }, ip());
      const other = await db.lead.count({ where: { contact: { not: contact } } });
      expect(await leads.deleteLeadsByContact(contact, null)).toBe(2);
      expect(await db.lead.count({ where: { contact } })).toBe(0);
      expect(await db.lead.count({ where: { contact: { not: contact } } })).toBe(other);
      expect(await leads.deleteLeadsByContact(contact, null)).toBe(0);
    });
  });

  describe("anonymous engagement", () => {
    it("records views and WhatsApp taps, ignoring quick repeats", async () => {
      const session = crypto.randomUUID();
      expect(await pub.recordEvent(A.link, session, "VIEW", "WHATSAPP")).toBe(true);
      expect(await pub.recordEvent(A.link, session, "VIEW", "WHATSAPP")).toBe(false);
      expect(await pub.recordEvent(A.link, crypto.randomUUID(), "VIEW", "UNKNOWN")).toBe(true);
      expect(await pub.recordEvent(A.link, session, "WHATSAPP_CLICK", "WHATSAPP")).toBe(true);
      const stats = await leads.campaignStats(A.sellerId, A.campaignId);
      expect(stats).toMatchObject({ views: 2, clicks: 1 });
      // another seller's stats are scoped to them
      expect(await leads.campaignStats(B.sellerId, A.campaignId)).toMatchObject({ views: 0, clicks: 0, leads: 0 });
    });

    it("doesn't record events for unpublished campaigns", async () => {
      await db.sellerCampaign.update({ where: { id: B.campaignId }, data: { status: "DRAFT" } });
      expect(await pub.recordEvent(B.link, crypto.randomUUID(), "VIEW", "UNKNOWN")).toBe(false);
      await db.sellerCampaign.update({ where: { id: B.campaignId }, data: { status: "ACTIVE" } });
    });
  });
});
