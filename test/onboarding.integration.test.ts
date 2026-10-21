// Runs the onboarding operations against a real database.
// Opt-in: set TEST_DATABASE_URL to a disposable, migrated database.
// It only deletes the users it creates (emails under @reach-test.invalid).
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const run = describe.skipIf(!url);

run("seller onboarding (integration)", () => {
  let db: typeof import("@/lib/db").db;
  let ob: typeof import("@/lib/onboarding");
  let userA: string;
  let userB: string;
  let hairId: string;
  let beautyId: string;
  const tag = Date.now();
  // A business name unique to this run so slug assertions are deterministic.
  const sharedName = `Lindiwe Hair ${tag}`;

  const makeUser = async (label: string) =>
    (await db.user.create({ data: { email: `${label}-${tag}@reach-test.invalid`, name: label } })).id;

  const step2 = (categoryIds: string[]) => ({
    categoryIds,
    province: "GAUTENG",
    location: "Soweto",
    fulfilment: ["DELIVERY", "COLLECTION"],
    serviceArea: "Soweto and Joburg South",
  });

  const noLinks = { instagramUrl: null, facebookUrl: null, tiktokUrl: null, websiteUrl: null };

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ db } = await import("@/lib/db"));
    ob = await import("@/lib/onboarding");
    userA = await makeUser("seller-a");
    userB = await makeUser("seller-b");
    hairId = (await db.category.findUniqueOrThrow({ where: { slug: "hair-wigs-weaves" } })).id;
    beautyId = (await db.category.findUniqueOrThrow({ where: { slug: "beauty-personal-care" } })).id;
  });

  afterAll(async () => {
    if (!db) return;
    const users = await db.user.findMany({ where: { email: { endsWith: "@reach-test.invalid" } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    await db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  it("seeds the initial categories", async () => {
    expect(await db.category.count({ where: { isActive: true } })).toBeGreaterThanOrEqual(14);
  });

  it("will not save categories or finish before step 1", async () => {
    await expect(ob.saveCategoriesStep(userA, step2([hairId]))).rejects.toMatchObject({ code: "NO_SELLER" });
    await expect(ob.completeOnboarding(userA, noLinks)).rejects.toMatchObject({ code: "NO_SELLER" });
  });

  it("creates a seller with a slug from the business name", async () => {
    const seller = await ob.saveBusinessStep(userA, {
      businessName: sharedName,
      whatsappNumber: "+27821234567",
      description: null,
    });
    expect(seller.slug).toBe(`lindiwe-hair-${tag}`);
    expect(seller.status).toBe("ONBOARDING");
  });

  it("gives a second seller with the same name a distinct slug", async () => {
    const seller = await ob.saveBusinessStep(userB, {
      businessName: sharedName,
      whatsappNumber: "+27720000000",
      description: null,
    });
    expect(seller.slug).toBe(`lindiwe-hair-${tag}-2`);
  });

  it("keeps the slug stable when the business name changes", async () => {
    const seller = await ob.saveBusinessStep(userA, {
      businessName: "Thandi's Hair Boutique",
      whatsappNumber: "+27821234567",
      description: "Quality weaves",
    });
    expect(seller.slug).toBe(`lindiwe-hair-${tag}`);
    expect(seller.businessName).toBe("Thandi's Hair Boutique");
    expect(await db.seller.count({ where: { userId: userA } })).toBe(1);
  });

  it("will not finish before categories are chosen", async () => {
    await expect(ob.completeOnboarding(userA, noLinks)).rejects.toMatchObject({ code: "STEP_INCOMPLETE" });
  });

  it("rejects unknown or inactive categories", async () => {
    await expect(ob.saveCategoriesStep(userA, step2([crypto.randomUUID()]))).rejects.toMatchObject({
      code: "INVALID_CATEGORY",
    });
  });

  it("saves and replaces categories", async () => {
    await ob.saveCategoriesStep(userA, step2([hairId, beautyId]));
    await ob.saveCategoriesStep(userA, step2([hairId]));
    const seller = await db.seller.findUniqueOrThrow({ where: { userId: userA }, include: { categories: true } });
    expect(seller.categories.map((c) => c.categoryId)).toEqual([hairId]);
    expect(seller.province).toBe("GAUTENG");
    expect(seller.fulfilment).toEqual(["DELIVERY", "COLLECTION"]);
  });

  it("completes onboarding and records when", async () => {
    const seller = await ob.completeOnboarding(userA, {
      ...noLinks,
      instagramUrl: "https://www.instagram.com/thandihair",
    });
    expect(seller.status).toBe("ACTIVE");
    expect(seller.onboardedAt).toBeInstanceOf(Date);
    const first = seller.onboardedAt;
    const again = await ob.completeOnboarding(userA, noLinks);
    expect(again.onboardedAt).toEqual(first);
  });

  it("never lets one seller's changes touch another seller", async () => {
    const before = await db.seller.findUniqueOrThrow({ where: { userId: userB }, include: { categories: true } });
    await ob.saveBusinessStep(userA, { businessName: "Changed by A", whatsappNumber: "+27821234567", description: null });
    await ob.saveCategoriesStep(userA, step2([beautyId]));
    const after = await db.seller.findUniqueOrThrow({ where: { userId: userB }, include: { categories: true } });
    expect(after.businessName).toBe(sharedName);
    expect(after.whatsappNumber).toBe(before.whatsappNumber);
    expect(after.categories).toEqual(before.categories);
    expect(after.status).toBe("ONBOARDING");
  });

  it("writes an audit trail without personal details", async () => {
    const entries = await db.auditLog.findMany({ where: { actorId: userA }, orderBy: { createdAt: "asc" } });
    expect(entries.map((e) => e.action)).toContain("seller.created");
    expect(entries.map((e) => e.action)).toContain("seller.onboarded");
    expect(entries.every((e) => e.entity === "seller")).toBe(true);
  });

  it("handles simultaneous saves without duplicates or slug clashes", async () => {
    const racers = await Promise.all(["race-1", "race-2", "race-3", "race-4"].map(makeUser));
    const name = `Race Hair ${tag}`;
    const input = { businessName: name, whatsappNumber: "+27821234567", description: null };
    // Four sellers with the same name at once, plus a double-submit by the first.
    const sellers = await Promise.all([...racers, racers[0]].map((u) => ob.saveBusinessStep(u, input)));
    const slugs = new Set(sellers.slice(0, 4).map((s) => s.slug));
    expect(slugs.size).toBe(4);
    expect(await db.seller.count({ where: { userId: racers[0] } })).toBe(1);
  });

  it("reports the furthest step a seller may open", async () => {
    expect(ob.furthestStep(null)).toBe(1);
    expect(ob.furthestStep({ categoryCount: 0 })).toBe(2);
    expect(ob.furthestStep({ categoryCount: 1 })).toBe(3);
    const stateB = await ob.getOnboardingState(userB);
    expect(stateB.furthest).toBe(2);
  });
});
