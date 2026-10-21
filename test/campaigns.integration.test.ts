// Runs the campaign engine against a real database, with the AI provider
// mocked so every path (success, retry, failure, template) is deterministic.
// Opt-in: set TEST_DATABASE_URL to a disposable, migrated database.
// It only deletes the users it creates (emails ending -<run tag>@reach-test.invalid).
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const generateStructured = vi.fn();
const aiConfigured = vi.fn(() => true);
vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return { ...actual, generateStructured, isAIConfigured: aiConfigured };
});

const url = process.env.TEST_DATABASE_URL;
const run = describe.skipIf(!url);

const goodCopy = {
  title: "Hair that turns heads",
  objective: "Get new customers to message about weaves and wigs.",
  headline: "Your next look starts at {{business_name}}",
  body: "Ready for a fresh style? {{business_name}} in {{location}} can help. Send a message to see what's available.",
  call_to_action: "Message us on WhatsApp",
};
const aiResult = (output: object) => ({
  output,
  content: [{ type: "text", text: JSON.stringify(output) }],
  model: "claude-opus-5-5",
  usage: { inputTokens: 900, outputTokens: 300 },
});

run("campaign engine (integration)", () => {
  let db: typeof import("@/lib/db").db;
  let engine: typeof import("@/lib/campaigns");
  let AIError: typeof import("@/lib/ai").AIError;
  const tag = Date.now();
  let admin: string;
  let hairId: string, foodId: string;
  type S = { userId: string; id: string; slug: string; businessName: string; location: string | null };
  let sellerA: S, sellerB: S, sellerFood: S;

  async function makeSeller(label: string, businessName: string, location: string, categoryIds: string[]): Promise<S> {
    const user = await db.user.create({ data: { email: `${label}-${tag}@reach-test.invalid`, name: label } });
    const seller = await db.seller.create({
      data: {
        userId: user.id,
        slug: `${label}-${tag}`,
        businessName,
        location,
        status: "ACTIVE",
        categories: { create: categoryIds.map((categoryId) => ({ categoryId })) },
      },
    });
    return { userId: user.id, id: seller.id, slug: seller.slug, businessName, location };
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ db } = await import("@/lib/db"));
    engine = await import("@/lib/campaigns");
    ({ AIError } = await import("@/lib/ai"));
    admin = (
      await db.user.create({ data: { email: `admin-${tag}@reach-test.invalid`, name: "Admin", role: "ADMIN" } })
    ).id;
    hairId = (await db.category.findUniqueOrThrow({ where: { slug: "hair-wigs-weaves" } })).id;
    foodId = (await db.category.findUniqueOrThrow({ where: { slug: "food-baking-catering" } })).id;
    sellerA = await makeSeller("camp-a", "Thandi's Hair Boutique", "Soweto", [hairId]);
    sellerB = await makeSeller("camp-b", "Lindiwe Hair & Beauty", "Durban", [hairId]);
    sellerFood = await makeSeller("camp-food", "Mama's Kitchen", "Tembisa", [foodId]);
  });

  beforeEach(() => {
    generateStructured.mockReset();
    aiConfigured.mockReturnValue(true);
  });

  afterAll(async () => {
    if (!db) return;
    const users = await db.user.findMany({ where: { email: { endsWith: `-${tag}@reach-test.invalid` } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    const sellers = await db.seller.findMany({ where: { userId: { in: ids } }, select: { id: true } });
    await db.sellerCampaign.deleteMany({ where: { sellerId: { in: sellers.map((s) => s.id) } } });
    const jobs = await db.aIJob.findMany({ where: { requestedBy: { in: ids } }, select: { id: true } });
    await db.masterCampaign.deleteMany({ where: { aiJobId: { in: jobs.map((j) => j.id) } } });
    await db.aIJob.deleteMany({ where: { requestedBy: { in: ids } } });
    await db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  describe("generating master campaigns", () => {
    it("publishes valid AI copy and records the job", async () => {
      generateStructured.mockResolvedValueOnce(aiResult(goodCopy));
      const master = await engine.generateMasterCampaign(admin, hairId);
      expect(master).toMatchObject({ source: "AI", model: "claude-opus-5-5", status: "PUBLISHED", headline: goodCopy.headline });
      const job = await db.aIJob.findUniqueOrThrow({ where: { id: master.aiJobId! } });
      expect(job).toMatchObject({ status: "SUCCEEDED", provider: "anthropic", attempts: 1, inputTokens: 900, outputTokens: 300 });
      // The category reaches the model as data inside tags.
      const { messages } = generateStructured.mock.calls[0][0];
      expect(messages[0].content).toContain("<name>Hair, wigs & weaves</name>");
    });

    it("retries once with the broken rules, then publishes", async () => {
      generateStructured
        .mockResolvedValueOnce(aiResult({ ...goodCopy, headline: "Weaves from R299 at {{business_name}}" }))
        .mockResolvedValueOnce(aiResult({ ...goodCopy, title: "Fresh looks, second try" }));
      const master = await engine.generateMasterCampaign(admin, hairId);
      expect(master.title).toBe("Fresh looks, second try");
      const retry = generateStructured.mock.calls[1][0].messages;
      expect(retry).toHaveLength(3);
      expect(retry[1].role).toBe("assistant");
      expect(retry[2].content).toContain("headline contains a rand amount");
      // Earlier titles are passed so the model doesn't repeat itself.
      expect(generateStructured.mock.calls[0][0].messages[0].content).toContain('"Hair that turns heads"');
      expect((await db.aIJob.findUniqueOrThrow({ where: { id: master.aiJobId! } })).attempts).toBe(2);
    });

    it("publishes nothing when the copy fails validation twice", async () => {
      const bad = aiResult({ ...goodCopy, body: "Free delivery and 20% off!" });
      generateStructured.mockResolvedValueOnce(bad).mockResolvedValueOnce(bad);
      const before = await db.masterCampaign.count({ where: { categoryId: hairId } });
      await expect(engine.generateMasterCampaign(admin, hairId)).rejects.toMatchObject({ code: "GENERATION_FAILED" });
      expect(await db.masterCampaign.count({ where: { categoryId: hairId } })).toBe(before);
      const job = await db.aIJob.findFirstOrThrow({ where: { requestedBy: admin }, orderBy: { createdAt: "desc" } });
      expect(job.status).toBe("FAILED");
      expect(job.error).toContain('contains the word "free"');
      expect(job.finishedAt).toBeInstanceOf(Date);
    });

    it("records provider failures as failed jobs", async () => {
      generateStructured.mockRejectedValueOnce(new AIError("refusal", "The model declined the request (category: cyber)."));
      await expect(engine.generateMasterCampaign(admin, hairId)).rejects.toMatchObject({ code: "GENERATION_FAILED" });
      const job = await db.aIJob.findFirstOrThrow({ where: { requestedBy: admin }, orderBy: { createdAt: "desc" } });
      expect(job).toMatchObject({ status: "FAILED", attempts: 1 });
      expect(job.error).toContain("refusal");
    });

    it("falls back to labelled template copy when AI isn't configured", async () => {
      aiConfigured.mockReturnValue(false);
      const master = await engine.generateMasterCampaign(admin, foodId);
      expect(master).toMatchObject({ source: "TEMPLATE", model: null });
      expect(generateStructured).not.toHaveBeenCalled();
      const job = await db.aIJob.findUniqueOrThrow({ where: { id: master.aiJobId! } });
      expect(job).toMatchObject({ status: "SUCCEEDED", provider: "template" });
    });

    it("rejects unknown categories", async () => {
      await expect(engine.generateMasterCampaign(admin, crypto.randomUUID())).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("seller library and personalisation", () => {
    let hairMaster: string, foodMaster: string;
    beforeAll(async () => {
      hairMaster = (await db.masterCampaign.findFirstOrThrow({ where: { categoryId: hairId, title: goodCopy.title } })).id;
      foodMaster = (await db.masterCampaign.findFirstOrThrow({ where: { categoryId: foodId, source: "TEMPLATE" }, orderBy: { createdAt: "desc" } })).id;
    });

    it("shows sellers only campaigns for their own categories", async () => {
      const hairLib = (await engine.listCampaignLibrary(sellerA.id)).map((m) => m.id);
      expect(hairLib).toContain(hairMaster);
      expect(hairLib).not.toContain(foodMaster);
      const foodLib = (await engine.listCampaignLibrary(sellerFood.id)).map((m) => m.id);
      expect(foodLib).toContain(foodMaster);
      expect(foodLib).not.toContain(hairMaster);
    });

    it("won't personalise a campaign outside the seller's categories", async () => {
      await expect(engine.personaliseCampaign(sellerFood.userId, sellerFood, hairMaster, null)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    it("personalises the same master independently for two sellers", async () => {
      const a = await engine.personaliseCampaign(sellerA.userId, sellerA, hairMaster, null);
      const b = await engine.personaliseCampaign(sellerB.userId, sellerB, hairMaster, null);
      expect(a.headline).toBe("Your next look starts at Thandi's Hair Boutique");
      expect(a.body).toContain("Thandi's Hair Boutique in Soweto");
      expect(b.body).toContain("Lindiwe Hair & Beauty in Durban");
      expect(`${a.headline}${a.body}${b.headline}${b.body}`).not.toContain("{{");
      expect(a.uniqueLink).toMatch(new RegExp(`^${sellerA.slug}-[A-Za-z2-9]{8}$`));
      expect(a.uniqueLink).not.toBe(b.uniqueLink);
      expect(a.status).toBe("DRAFT");
    });

    it("is idempotent: personalising again returns the same campaign", async () => {
      const first = await engine.personaliseCampaign(sellerA.userId, sellerA, hairMaster, null);
      const again = await engine.personaliseCampaign(sellerA.userId, sellerA, hairMaster, null);
      expect(again.id).toBe(first.id);
      expect(await db.sellerCampaign.count({ where: { sellerId: sellerA.id, masterCampaignId: hairMaster } })).toBe(1);
    });

    it("handles a double submit without duplicates", async () => {
      const masterId = (
        await db.masterCampaign.findFirstOrThrow({ where: { categoryId: hairId, title: "Fresh looks, second try" } })
      ).id;
      const results = await Promise.all([1, 2, 3].map(() => engine.personaliseCampaign(sellerB.userId, sellerB, masterId, null)));
      expect(new Set(results.map((r) => r.id)).size).toBe(1);
    });

    it("only features the seller's own current products", async () => {
      generateStructured.mockResolvedValueOnce(aiResult({ ...goodCopy, title: "Product feature test" }));
      const master = await engine.generateMasterCampaign(admin, hairId);
      const productB = await db.product.create({ data: { sellerId: sellerB.id, categoryId: hairId, name: "B's wig" } });
      await expect(engine.personaliseCampaign(sellerA.userId, sellerA, master.id, productB.id)).rejects.toMatchObject({
        code: "INVALID_PRODUCT",
      });

      const archived = await db.product.create({
        data: { sellerId: sellerA.id, categoryId: hairId, name: "Old wig", status: "ARCHIVED" },
      });
      await expect(engine.personaliseCampaign(sellerA.userId, sellerA, master.id, archived.id)).rejects.toMatchObject({
        code: "INVALID_PRODUCT",
      });

      const productA = await db.product.create({
        data: { sellerId: sellerA.id, categoryId: hairId, name: "Body wave 22in", price: "1250.00" },
      });
      const campaign = await engine.personaliseCampaign(sellerA.userId, sellerA, master.id, productA.id);
      const detail = await engine.getSellerCampaign(sellerA.id, campaign.id);
      // Price comes from the product record, exactly; the AI never sees it.
      expect(detail?.product).toMatchObject({ name: "Body wave 22in", price: "1250.00" });
    });

    it("keeps each seller's campaign private", async () => {
      const [mineA] = await engine.listSellerCampaigns(sellerA.id);
      expect(await engine.getSellerCampaign(sellerB.id, mineA.id)).toBeNull();
      expect((await engine.listSellerCampaigns(sellerB.id)).some((c) => c.id === mineA.id)).toBe(false);
    });

    it("snapshots copy: later changes to the master don't alter seller campaigns", async () => {
      const campaign = await db.sellerCampaign.findFirstOrThrow({ where: { sellerId: sellerA.id, masterCampaignId: hairMaster } });
      await db.masterCampaign.update({ where: { id: hairMaster }, data: { headline: "Changed {{business_name}}" } });
      const after = await db.sellerCampaign.findUniqueOrThrow({ where: { id: campaign.id } });
      expect(after.headline).toBe(campaign.headline);
    });

    it("hides archived masters from the library", async () => {
      await db.masterCampaign.update({ where: { id: foodMaster }, data: { status: "ARCHIVED" } });
      expect((await engine.listCampaignLibrary(sellerFood.id)).some((m) => m.id === foodMaster)).toBe(false);
      await expect(engine.personaliseCampaign(sellerFood.userId, sellerFood, foodMaster, null)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });
  });
});
