// Step 4b against a real database: opening hours, the shop pin and
// collection address, the call number, quick price editing, flyer import
// (AI mocked) and Explore's "Open now" and pin distances.
// Opt-in: set TEST_DATABASE_URL to a disposable, migrated database.
// It only deletes the users it creates (emails ending -<run tag>@reach-test.invalid).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

const generateStructured = vi.fn();
const aiConfigured = vi.fn(() => true);
vi.mock("@/lib/ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ai")>();
  return { ...actual, generateStructured, isAIConfigured: aiConfigured };
});

const url = process.env.TEST_DATABASE_URL;
const run = describe.skipIf(!url);

run("catalogue and location (integration)", () => {
  let db: typeof import("@/lib/db").db;
  let storefronts: typeof import("@/lib/storefronts");
  let pub: typeof import("@/lib/public-storefronts");
  let products: typeof import("@/lib/products");
  let explore: typeof import("@/lib/explore");
  let menu: typeof import("@/lib/menu-import");
  const tag = Date.now();
  const word = `zqvx${tag}`; // a search word only this file's sellers have
  let foodId: string;
  let mdantsane: { id: string; slug: string; name: string; province: string; latitude: number; longitude: number };
  let eastLondon: typeof mdantsane;
  type S = { userId: string; id: string; slug: string };
  let kitchen: S, other: S;

  async function makeSeller(key: string): Promise<S> {
    const user = await db.user.create({ data: { email: `cl-${key}-${tag}@reach-test.invalid`, name: key } });
    const s = await db.seller.create({
      data: {
        userId: user.id,
        slug: `cl-${key}-${tag}`,
        businessName: `${key} ${word}`,
        status: "ACTIVE",
        whatsappNumber: "+27821234567",
        placeId: mdantsane.id,
        storefrontPublishedAt: new Date(),
        fulfilment: ["COLLECTION"],
        categories: { create: [{ categoryId: foodId }] },
      },
    });
    return { userId: user.id, id: s.id, slug: s.slug };
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ db } = await import("@/lib/db"));
    storefronts = await import("@/lib/storefronts");
    pub = await import("@/lib/public-storefronts");
    products = await import("@/lib/products");
    explore = await import("@/lib/explore");
    menu = await import("@/lib/menu-import");
    foodId = (await db.category.findUniqueOrThrow({ where: { slug: "food-baking-catering" } })).id;
    const sel = { id: true, slug: true, name: true, province: true, latitude: true, longitude: true } as const;
    mdantsane = await db.place.findUniqueOrThrow({ where: { slug: "mdantsane-eastern-cape" }, select: sel });
    eastLondon = await db.place.findUniqueOrThrow({ where: { slug: "east-london-eastern-cape" }, select: sel });
    kitchen = await makeSeller("kitchen");
    other = await makeSeller("other");
  });

  afterAll(async () => {
    if (!db) return;
    const users = await db.user.findMany({ where: { email: { endsWith: `-${tag}@reach-test.invalid` } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    await db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    await db.aIJob.deleteMany({ where: { requestedBy: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  it("has the township places", async () => {
    const names = (await db.place.findMany({ where: { name: { in: ["Mdantsane", "Khayelitsha", "Umlazi"] } }, select: { name: true } })).map((p) => p.name);
    expect(names.sort()).toEqual(["Khayelitsha", "Mdantsane", "Umlazi"]);
  });

  describe("opening hours", () => {
    // Wednesday 2026-10-21, 10:00 in South Africa (08:00 UTC).
    const wedMorning = new Date("2026-10-21T08:00:00Z");

    it("saves weekly hours and reports open/closed", async () => {
      await storefronts.saveHours(kitchen.userId, kitchen.id, {
        slots: [1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, opensAt: 8 * 60, closesAt: 20 * 60 })),
        note: "Taking orders for tomorrow",
      });
      const s = await storefronts.getStorefrontSettings(kitchen.id);
      expect(s.hours).toHaveLength(5);
      expect(s.hoursNote).toBe("Taking orders for tomorrow");
      const { openStatus } = await import("@/lib/hours-rules");
      expect(openStatus(s.hours, wedMorning, s.closedUntil)?.label).toBe("Open now · closes 20:00");
    });

    it("replaces hours rather than adding to them", async () => {
      await storefronts.saveHours(kitchen.userId, kitchen.id, {
        slots: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, opensAt: 8 * 60, closesAt: 20 * 60 })),
        note: null,
      });
      const s = await storefronts.getStorefrontSettings(kitchen.id);
      expect(s.hours).toHaveLength(7);
      expect(s.hoursNote).toBeNull();
    });

    it("rejects invalid slots at the database too", async () => {
      await expect(db.sellerHours.create({ data: { sellerId: kitchen.id, dayOfWeek: 7, opensAt: 0, closesAt: 60 } })).rejects.toThrow();
      await expect(db.sellerHours.create({ data: { sellerId: kitchen.id, dayOfWeek: 1, opensAt: 60, closesAt: 60 } })).rejects.toThrow();
    });

    it("closed today lasts until midnight South African time", async () => {
      await storefronts.setClosedToday(kitchen.userId, kitchen.id, true, wedMorning);
      const s = await storefronts.getStorefrontSettings(kitchen.id);
      expect(s.closedUntil?.toISOString()).toBe("2026-10-21T22:00:00.000Z");
      const { openStatus } = await import("@/lib/hours-rules");
      expect(openStatus(s.hours, wedMorning, s.closedUntil)?.label).toBe("Closed today · opens 08:00 tomorrow");
      await storefronts.setClosedToday(kitchen.userId, kitchen.id, false, wedMorning);
      expect((await storefronts.getStorefrontSettings(kitchen.id)).closedUntil).toBeNull();
    });
  });

  describe("pin and collection", () => {
    it("needs a pin before collection can be offered", async () => {
      await expect(
        storefronts.saveCollection(kitchen.userId, kitchen.id, { offersCollection: true, collectionAddress: "2192 NU 11A, Mdantsane", callNumber: null }),
      ).rejects.toMatchObject({ code: "NEEDS_PIN" });
    });

    it("rejects a pin far from the seller's town", async () => {
      // Johannesburg: hundreds of km from Mdantsane.
      await expect(storefronts.setPin(kitchen.userId, kitchen.id, -26.2, 28.04)).rejects.toMatchObject({ code: "INVALID_PIN" });
    });

    it("saves a rounded pin, then collection with an address and call number", async () => {
      const pin = await storefronts.setPin(kitchen.userId, kitchen.id, -32.98123456, 27.85987654);
      expect(pin).toEqual({ latitude: -32.98123, longitude: 27.85988 });
      await storefronts.saveCollection(kitchen.userId, kitchen.id, {
        offersCollection: true,
        collectionAddress: "2192 NU 11A, Mdantsane",
        callNumber: "+27731021410",
      });
      const s = await storefronts.getStorefrontSettings(kitchen.id);
      expect(s.offersCollection).toBe(true);
      expect(s.collectionAddress).toBe("2192 NU 11A, Mdantsane");
    });

    it("shows the address to signed-in buyers only, and never in the public seller data", async () => {
      const store = await pub.getStorefront(kitchen.slug);
      expect(store).not.toBeNull();
      expect(pub.collectionPoint(store!.seller, false)).toBeNull();
      expect(pub.collectionPoint(store!.seller, true)).toEqual({
        address: "2192 NU 11A, Mdantsane",
        pin: { latitude: -32.98123, longitude: 27.85988 },
      });
      const shown = JSON.stringify(pub.toPublicSeller(store!.seller));
      expect(shown).not.toContain("2192");
      expect(shown).not.toContain("27731021410");
      expect(shown).not.toContain("-32.98123");
    });

    it("gives the call number only for a published storefront", async () => {
      expect(await pub.getCallTarget(kitchen.slug)).toEqual({ callNumber: "+27731021410" });
      await db.seller.update({ where: { id: kitchen.id }, data: { storefrontPublishedAt: null } });
      expect(await pub.getCallTarget(kitchen.slug)).toBeNull();
      await db.seller.update({ where: { id: kitchen.id }, data: { storefrontPublishedAt: new Date() } });
      expect(await pub.getCallTarget(other.slug)).toBeNull(); // no call number set
    });

    it("measures Explore distance from the pin, not the town centre", async () => {
      const { cards } = await explore.exploreSellers({ place: eastLondon, categories: null, query: word });
      const k = cards.find((c) => c.slug === kitchen.slug)!;
      const o = cards.find((c) => c.slug === other.slug)!;
      // Pin is closer to East London than Mdantsane's centre is.
      const km = (c: typeof k) => Number(/about (\d+) km/.exec(c.reasons.join(" "))?.[1] ?? 0);
      expect(km(k)).toBeGreaterThan(0);
      expect(km(k)).toBeLessThan(km(o));
    });

    it("removing the pin turns collection off", async () => {
      await storefronts.clearPin(kitchen.userId, kitchen.id);
      const s = await storefronts.getStorefrontSettings(kitchen.id);
      expect(s.pinLatitude).toBeNull();
      expect(s.offersCollection).toBe(false);
      // Database rule: collection needs a pin.
      await expect(db.seller.update({ where: { id: kitchen.id }, data: { offersCollection: true } })).rejects.toThrow();
    });
  });

  describe("Explore open now", () => {
    it("keeps only sellers open at that moment", async () => {
      // kitchen: open every day 08:00–20:00; other: no hours set.
      const wedNoon = new Date("2026-10-21T10:00:00Z");
      const wedNight = new Date("2026-10-21T20:30:00Z"); // 22:30 SA
      const open = await explore.exploreSellers({ place: null, categories: null, query: word, openNow: true, now: wedNoon });
      expect(open.cards.map((c) => c.slug)).toEqual([kitchen.slug]);
      expect(open.cards[0].openLabel).toBe("Open now · closes 20:00");
      const late = await explore.exploreSellers({ place: null, categories: null, query: word, openNow: true, now: wedNight });
      expect(late.cards).toHaveLength(0);
      const all = await explore.exploreSellers({ place: null, categories: null, query: word, now: wedNight });
      expect(all.cards.map((c) => c.slug).sort()).toEqual([kitchen.slug, other.slug].sort());
    });
  });

  describe("quick price editing", () => {
    let ginger: string, ulusu: string;
    beforeAll(async () => {
      const base = { kind: "PRODUCT" as const, categoryId: foodId, description: null, leadTimeDays: null };
      ginger = (await products.createProduct(kitchen.userId, kitchen.id, { ...base, name: "Ginger 2L", priceType: "FIXED", price: "25.00", availability: "IN_STOCK" })).id;
      ulusu = (await products.createProduct(kitchen.userId, kitchen.id, { ...base, name: "Ulusu", priceType: "FIXED", price: "30.00", availability: "IN_STOCK" })).id;
    });

    it("saves several changes at once and skips unchanged rows", async () => {
      const r = await products.bulkUpdateItems(kitchen.userId, kitchen.id, [
        { id: ginger, priceType: "FIXED", price: "R28", availability: "IN_STOCK" },
        { id: ulusu, priceType: "FIXED", price: "30", availability: "OUT_OF_STOCK" },
      ]);
      expect(r).toEqual({ saved: 2, errors: {} });
      expect((await products.getProduct(kitchen.id, ginger))?.price).toBe("28.00");
      const u = await products.getProduct(kitchen.id, ulusu);
      expect(u?.availability).toBe("OUT_OF_STOCK");
      expect(u?.status).toBe("UNAVAILABLE");
      const again = await products.bulkUpdateItems(kitchen.userId, kitchen.id, [{ id: ginger, priceType: "FIXED", price: "28", availability: "IN_STOCK" }]);
      expect(again.saved).toBe(0);
    });

    it("saves nothing if any row is wrong", async () => {
      const r = await products.bulkUpdateItems(kitchen.userId, kitchen.id, [
        { id: ginger, priceType: "FIXED", price: "35", availability: "IN_STOCK" },
        { id: ulusu, priceType: "FIXED", price: "abc", availability: "IN_STOCK" },
      ]);
      expect(r.saved).toBe(0);
      expect(Object.keys(r.errors)).toEqual([ulusu]);
      expect((await products.getProduct(kitchen.id, ginger))?.price).toBe("28.00");
    });

    it("can't touch another seller's items", async () => {
      const r = await products.bulkUpdateItems(other.userId, other.id, [{ id: ginger, priceType: "FIXED", price: "1", availability: "IN_STOCK" }]);
      expect(r.saved).toBe(0);
      expect(r.errors[ginger]).toBeDefined();
      expect((await products.getProduct(kitchen.id, ginger))?.price).toBe("28.00");
    });
  });

  describe("flyer import", () => {
    let flyer: Buffer;
    beforeAll(async () => {
      flyer = await sharp({ create: { width: 2400, height: 1600, channels: 3, background: "#ffcc00" } }).png().toBuffer();
    });

    it("sends a shrunk JPEG to the model and returns an editable draft", async () => {
      generateStructured.mockResolvedValueOnce({
        output: {
          is_price_list: true,
          items: [
            { name: "Isibindi", kind: "PRODUCT", price_type: "FIXED", price: 25, description: null },
            { name: "Ulusu with steambread", kind: "PRODUCT", price_type: "FIXED", price: 40, description: null },
            { name: "Kota", kind: "PRODUCT", price_type: "FIXED", price: null, description: "with chips" },
          ],
          warnings: [],
        },
        content: [],
        model: "claude-opus-5-5",
        usage: { inputTokens: 1500, outputTokens: 200 },
      });
      const draft = await menu.readMenuFromImage(other.userId, other.id, flyer);
      expect(draft.items.map((i) => [i.name, i.priceType, i.price])).toEqual([
        ["Isibindi", "FIXED", "25"],
        ["Ulusu with steambread", "FIXED", "40"],
        ["Kota", "ON_REQUEST", ""],
      ]);
      expect(draft.warnings.join(" ")).toMatch(/no price we could read/);

      const call = generateStructured.mock.calls.at(-1)![0];
      const image = call.messages[0].content[0];
      expect(image.source.media_type).toBe("image/jpeg");
      const meta = await sharp(Buffer.from(image.source.data, "base64")).metadata();
      expect(meta.format).toBe("jpeg");
      expect(Math.max(meta.width!, meta.height!)).toBe(1568);

      const job = await db.aIJob.findFirstOrThrow({ where: { requestedBy: other.userId, taskType: "MENU_IMPORT" }, orderBy: { createdAt: "desc" } });
      expect(job.status).toBe("SUCCEEDED");
      expect(job.inputTokens).toBe(1500);
    });

    it("records a failed read without storing the photo", async () => {
      const { AIError } = await import("@/lib/ai");
      generateStructured.mockRejectedValueOnce(new AIError("unavailable", "down"));
      await expect(menu.readMenuFromImage(other.userId, other.id, flyer)).rejects.toMatchObject({ code: "failed" });
      const job = await db.aIJob.findFirstOrThrow({ where: { requestedBy: other.userId, taskType: "MENU_IMPORT" }, orderBy: { createdAt: "desc" } });
      expect(job.status).toBe("FAILED");
    });

    it("refuses files that aren't images, and works only with AI configured", async () => {
      await expect(menu.readMenuFromImage(other.userId, other.id, Buffer.from("not an image"))).rejects.toMatchObject({ code: "not_an_image" });
      aiConfigured.mockReturnValueOnce(false);
      await expect(menu.readMenuFromImage(other.userId, other.id, flyer)).rejects.toMatchObject({ code: "not_configured" });
    });

    it("saves a reviewed draft as items, all or nothing", async () => {
      const base = { kind: "PRODUCT" as const, categoryId: foodId, description: null, leadTimeDays: null, availability: "PRE_ORDER" as const };
      const n = await products.createProducts(other.userId, other.id, [
        { ...base, name: "Isibindi", priceType: "FIXED", price: "25.00" },
        { ...base, name: "Isibindi", priceType: "FIXED", price: "25.00" }, // same name: gets its own slug
      ]);
      expect(n).toBe(2);
      const list = await products.listProducts(other.id);
      expect(list.filter((p) => p.name === "Isibindi").map((p) => p.slug).sort()).toEqual(["isibindi", "isibindi-2"]);

      // A category the seller doesn't have: nothing saved.
      const hair = (await db.category.findUniqueOrThrow({ where: { slug: "hair-wigs-weaves" } })).id;
      await expect(
        products.createProducts(other.userId, other.id, [
          { ...base, name: "Vetkoek", priceType: "FIXED", price: "5.00" },
          { ...base, name: "Wig", categoryId: hair, priceType: "FIXED", price: "500.00" },
        ]),
      ).rejects.toMatchObject({ code: "INVALID_CATEGORY" });
      expect((await products.listProducts(other.id)).some((p) => p.name === "Vetkoek")).toBe(false);
    });
  });
});
