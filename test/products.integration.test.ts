// Runs product operations against a real database.
// Opt-in: set TEST_DATABASE_URL to a disposable, migrated database.
// It only deletes the users it creates (emails ending -<run tag>@reach-test.invalid).
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const run = describe.skipIf(!url);

run("products (integration)", () => {
  let db: typeof import("@/lib/db").db;
  let products: typeof import("@/lib/products");
  const tag = Date.now();
  let userA: string, userB: string, sellerA: string, sellerB: string;
  let hairId: string, foodId: string;

  const input = (over: Record<string, unknown> = {}) => ({
    kind: "PRODUCT" as const,
    name: "Brazilian body wave",
    categoryId: hairId,
    description: null,
    priceType: "FIXED" as const,
    price: "1250.00" as string | null,
    status: "AVAILABLE" as const,
    ...over,
  });

  async function makeSeller(label: string, categoryIds: string[]) {
    const user = await db.user.create({ data: { email: `${label}-${tag}@reach-test.invalid`, name: label } });
    const seller = await db.seller.create({
      data: {
        userId: user.id,
        slug: `${label}-${tag}`,
        businessName: label,
        status: "ACTIVE",
        categories: { create: categoryIds.map((categoryId) => ({ categoryId })) },
      },
    });
    return [user.id, seller.id];
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ db } = await import("@/lib/db"));
    products = await import("@/lib/products");
    hairId = (await db.category.findUniqueOrThrow({ where: { slug: "hair-wigs-weaves" } })).id;
    foodId = (await db.category.findUniqueOrThrow({ where: { slug: "food-baking-catering" } })).id;
    [userA, sellerA] = await makeSeller("prod-a", [hairId]);
    [userB, sellerB] = await makeSeller("prod-b", [foodId]);
  });

  afterAll(async () => {
    if (!db) return;
    // Only this file's users: other test files may be running in parallel.
    const users = await db.user.findMany({ where: { email: { endsWith: `-${tag}@reach-test.invalid` } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    await db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  it("creates a product with exact decimal pricing", async () => {
    const p = await products.createProduct(userA, sellerA, input());
    expect(p.price?.toFixed(2)).toBe("1250.00");
    const got = await products.getProduct(sellerA, p.id);
    expect(got?.price).toBe("1250.00");
  });

  it("only allows the seller's own categories", async () => {
    await expect(products.createProduct(userA, sellerA, input({ categoryId: foodId }))).rejects.toMatchObject({
      code: "INVALID_CATEGORY",
    });
  });

  it("stores price on request as null", async () => {
    const p = await products.createProduct(userA, sellerA, input({ priceType: "ON_REQUEST", price: null, kind: "SERVICE" }));
    expect(p.price).toBeNull();
  });

  describe("seller isolation", () => {
    let productA: string;
    beforeAll(async () => {
      productA = (await products.createProduct(userA, sellerA, input({ name: "A's private wig" }))).id;
    });

    it("seller B cannot read seller A's product", async () => {
      expect(await products.getProduct(sellerB, productA)).toBeNull();
      const list = await products.listProducts(sellerB);
      expect(list.find((p) => p.id === productA)).toBeUndefined();
    });

    it("seller B cannot edit seller A's product", async () => {
      await expect(
        products.updateProduct(userB, sellerB, productA, input({ categoryId: foodId, name: "Hijacked" })),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect((await products.getProduct(sellerA, productA))?.name).toBe("A's private wig");
    });

    it("seller B cannot archive seller A's product", async () => {
      await expect(products.setArchived(userB, sellerB, productA, true)).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect((await products.getProduct(sellerA, productA))?.status).toBe("AVAILABLE");
    });
  });

  it("edits, archives and restores", async () => {
    const p = await products.createProduct(userA, sellerA, input({ name: "Closure wig" }));
    await products.updateProduct(userA, sellerA, p.id, input({ name: "Closure wig 16in", priceType: "FROM", price: "900.00" }));
    expect(await products.getProduct(sellerA, p.id)).toMatchObject({ name: "Closure wig 16in", priceType: "FROM", price: "900.00" });

    await products.setArchived(userA, sellerA, p.id, true);
    expect((await products.listProducts(sellerA)).some((x) => x.id === p.id)).toBe(false);
    expect((await products.listProducts(sellerA, { archived: true })).some((x) => x.id === p.id)).toBe(true);
    // archiving twice is reported, not silently repeated
    await expect(products.setArchived(userA, sellerA, p.id, true)).rejects.toMatchObject({ code: "NOT_FOUND" });

    await products.setArchived(userA, sellerA, p.id, false);
    expect((await products.getProduct(sellerA, p.id))?.status).toBe("AVAILABLE");
  });

  it("counts current and archived items", async () => {
    const counts = await products.countProducts(sellerA);
    expect(counts.active).toBeGreaterThanOrEqual(3);
    expect(await products.countProducts(sellerB)).toEqual({ active: 0, archived: 0 });
  });

  it("enforces the per-seller limit", async () => {
    const { MAX_PRODUCTS_PER_SELLER } = await import("@/lib/product-rules");
    const [userC, sellerC] = await makeSeller("prod-c", [hairId]);
    await db.product.createMany({
      data: Array.from({ length: MAX_PRODUCTS_PER_SELLER }, (_, i) => ({
        sellerId: sellerC,
        categoryId: hairId,
        name: `Item ${i}`,
      })),
    });
    await expect(products.createProduct(userC, sellerC, input())).rejects.toMatchObject({ code: "LIMIT_REACHED" });
  });

  it("audits product changes", async () => {
    const actions = (await db.auditLog.findMany({ where: { actorId: userA, entity: "product" } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["product.created", "product.updated", "product.archived", "product.restored"]));
  });
});
