// Photos (logos, covers, item photos) against a real database, with an
// in-memory storage backend that records every file stored and deleted.
// Opt-in: set TEST_DATABASE_URL to a disposable, migrated database. It only
// deletes the users it creates (emails ending -<run tag>@reach-test.invalid).
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Storage } from "@/lib/storage";

const url = process.env.TEST_DATABASE_URL;
const run = describe.skipIf(!url);

// Records puts and deletes; can be told to fail.
function memoryStorage() {
  const files = new Map<string, Buffer>();
  const deleted: string[] = [];
  let failPutAfter = Infinity;
  let puts = 0;
  const storage: Storage = {
    name: "local",
    async put(key, data) {
      if (++puts > failPutAfter) throw new Error("storage down");
      files.set(key, data);
      return { url: `https://files.test/${key}` };
    },
    async delete(keys) {
      for (const k of keys) {
        files.delete(k);
        deleted.push(k);
      }
    },
  };
  return {
    storage,
    files,
    deleted,
    failAfter(n: number) {
      failPutAfter = n;
      puts = 0;
    },
    reset() {
      files.clear();
      deleted.length = 0;
      failPutAfter = Infinity;
      puts = 0;
    },
  };
}

run("media (integration)", () => {
  let db: typeof import("@/lib/db").db;
  let media: typeof import("@/lib/media");
  let pub: typeof import("@/lib/public-storefronts");
  const mem = memoryStorage();
  const tag = Date.now();
  let hairId: string;
  type S = { userId: string; sellerId: string; slug: string; productId: string };
  let A: S, B: S;
  let jpeg: Buffer;

  async function seller(label: string): Promise<S> {
    const user = await db.user.create({ data: { email: `${label}-${tag}@reach-test.invalid`, name: label } });
    const s = await db.seller.create({
      data: {
        userId: user.id,
        slug: `${label}-${tag}`,
        businessName: `${label} Hair`,
        status: "ACTIVE",
        whatsappNumber: "+27821234567",
        storefrontPublishedAt: new Date(),
        categories: { create: [{ categoryId: hairId }] },
      },
    });
    const p = await db.product.create({
      data: { sellerId: s.id, categoryId: hairId, kind: "SERVICE", name: "Braids", slug: "braids", availability: "BY_BOOKING" },
    });
    return { userId: user.id, sellerId: s.id, slug: s.slug, productId: p.id };
  }

  const upload = (who: S, over: Partial<Parameters<typeof media.uploadImage>[0]> = {}) =>
    media.uploadImage(
      {
        userId: who.userId,
        sellerId: who.sellerId,
        target: "product",
        productId: who.productId,
        data: jpeg,
        altText: null,
        peopleConsent: true,
        ...over,
      },
      mem.storage,
    );

  const codeOf = (p: Promise<unknown>) =>
    p.then(
      () => "ok",
      (e) => (e instanceof media.MediaError ? e.code : String(e)),
    );

  const order = async (productId: string) =>
    (await db.productMedia.findMany({ where: { productId }, orderBy: { position: "asc" } })).map((r) => [r.position, r.mediaId]);

  async function clearPhotos(who: S) {
    await db.media.deleteMany({ where: { sellerId: who.sellerId } });
    await db.publicRateLimit.deleteMany({ where: { key: `upload:${who.sellerId}` } });
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ db } = await import("@/lib/db"));
    media = await import("@/lib/media");
    pub = await import("@/lib/public-storefronts");
    hairId = (await db.category.findUniqueOrThrow({ where: { slug: "hair-wigs-weaves" } })).id;
    A = await seller("md-a");
    B = await seller("md-b");
    jpeg = await sharp({ create: { width: 900, height: 600, channels: 3, background: "#c87" } })
      .withExif({ IFD3: { GPSLatitudeRef: "S", GPSLatitude: "26/1 16/1 0/1" } })
      .jpeg()
      .toBuffer();
  });

  beforeEach(async () => {
    mem.reset();
    await clearPhotos(A);
    await clearPhotos(B);
  });

  afterAll(async () => {
    if (!db) return;
    const users = await db.user.findMany({ where: { email: { endsWith: `-${tag}@reach-test.invalid` } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    const sellers = (await db.seller.findMany({ where: { userId: { in: ids } }, select: { id: true } })).map((s) => s.id);
    await db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    await db.media.deleteMany({ where: { sellerId: { in: sellers } } });
    await db.publicRateLimit.deleteMany({ where: { key: { in: sellers.map((s) => `upload:${s}`) } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  describe("item photos", () => {
    it("stores re-encoded files and records the photo, without metadata", async () => {
      const photo = await upload(A, { altText: "Waist-length knotless braids" });
      const row = await db.media.findUniqueOrThrow({ where: { id: photo.id } });
      expect(row).toMatchObject({ sellerId: A.sellerId, kind: "PRODUCT", altText: "Waist-length knotless braids", width: 900, height: 600 });
      expect(row.peopleConsentAt).not.toBeNull();
      expect(row.storageKeys).toEqual([`media/${photo.id}/lg.webp`, `media/${photo.id}/sm.webp`]);
      expect(row.url).toBe(`https://files.test/media/${photo.id}/lg.webp`);
      expect(row.thumbUrl).toBe(`https://files.test/media/${photo.id}/sm.webp`);
      for (const key of row.storageKeys) {
        const meta = await sharp(mem.files.get(key)!).metadata();
        expect(meta.format).toBe("webp");
        expect(meta.exif).toBeUndefined();
      }
      expect(await order(A.productId)).toEqual([[0, photo.id]]);
      expect(await db.auditLog.count({ where: { entityId: photo.id, action: "media.product_photo_added", actorId: A.userId } })).toBe(1);
    });

    it("needs the seller's confirmation of permission from people shown", async () => {
      expect(await codeOf(upload(A, { peopleConsent: false }))).toBe("consent_required");
      expect(mem.files.size).toBe(0);
    });

    it("can't add photos to another seller's item, or an archived one", async () => {
      expect(await codeOf(upload(B, { productId: A.productId }))).toBe("not_found");
      expect(await codeOf(upload(A, { productId: crypto.randomUUID() }))).toBe("not_found");
      await db.product.update({ where: { id: B.productId }, data: { status: "ARCHIVED" } });
      expect(await codeOf(upload(B))).toBe("not_found");
      await db.product.update({ where: { id: B.productId }, data: { status: "AVAILABLE" } });
      expect(await db.media.count({ where: { sellerId: { in: [A.sellerId, B.sellerId] } } })).toBe(0);
      expect(mem.files.size).toBe(0);
    });

    it("allows six photos per item, and no more", async () => {
      for (let i = 0; i < 6; i++) await upload(A);
      expect(await codeOf(upload(A))).toBe("limit_reached");
      expect((await order(A.productId)).map(([p]) => p)).toEqual([0, 1, 2, 3, 4, 5]);
      expect(mem.files.size).toBe(12);
    });

    it("holds the limit when uploads arrive at the same moment, and cleans up the losers' files", async () => {
      for (let i = 0; i < 4; i++) await upload(A);
      const results = await Promise.all(Array.from({ length: 4 }, () => codeOf(upload(A))));
      expect(results.filter((r) => r === "ok")).toHaveLength(2);
      expect(results.filter((r) => r === "limit_reached")).toHaveLength(2);
      expect(await db.productMedia.count({ where: { productId: A.productId } })).toBe(6);
      // Only the six saved photos' files remain.
      expect(mem.files.size).toBe(12);
      expect(await db.media.count({ where: { sellerId: A.sellerId } })).toBe(6);
    });

    it("the database itself refuses a seventh position", async () => {
      const photo = await upload(A);
      await expect(db.productMedia.update({ where: { mediaId: photo.id }, data: { position: 6 } })).rejects.toThrow();
    });

    it("saves nothing, and removes stored files, when storage fails part-way", async () => {
      mem.failAfter(1); // large size stored, small size fails
      expect(await codeOf(upload(A))).toBe("failed");
      expect(await db.media.count({ where: { sellerId: A.sellerId } })).toBe(0);
      expect(mem.files.size).toBe(0);
      expect(mem.deleted).toHaveLength(1);
    });

    it("rejects files that aren't photos", async () => {
      expect(await codeOf(upload(A, { data: Buffer.from("<html>hi</html>") }))).toBe("not_an_image");
      expect(mem.files.size).toBe(0);
    });

    it("limits uploads per seller per hour", async () => {
      await db.publicRateLimit.create({ data: { key: `upload:${A.sellerId}`, count: 60, windowStart: new Date() } });
      expect(await codeOf(upload(A))).toBe("rate_limited");
      expect(await codeOf(upload(B))).toBe("ok"); // other sellers unaffected
    });

    it("reorders: make main, earlier and later", async () => {
      const [p1, p2, p3] = [await upload(A), await upload(A), await upload(A)];
      await media.moveProductPhoto(A.userId, A.sellerId, p3.id, "main");
      expect((await order(A.productId)).map(([, id]) => id)).toEqual([p3.id, p1.id, p2.id]);
      await media.moveProductPhoto(A.userId, A.sellerId, p2.id, "earlier");
      expect((await order(A.productId)).map(([, id]) => id)).toEqual([p3.id, p2.id, p1.id]);
      await media.moveProductPhoto(A.userId, A.sellerId, p3.id, "later");
      expect((await order(A.productId)).map(([, id]) => id)).toEqual([p2.id, p3.id, p1.id]);
      // Moving past either end does nothing.
      await media.moveProductPhoto(A.userId, A.sellerId, p2.id, "earlier");
      await media.moveProductPhoto(A.userId, A.sellerId, p1.id, "later");
      expect(await order(A.productId)).toEqual([
        [0, p2.id],
        [1, p3.id],
        [2, p1.id],
      ]);
    });

    it("deletes a photo and its files, closing the gap", async () => {
      const [p1, p2, p3] = [await upload(A), await upload(A), await upload(A)];
      await media.deleteProductPhoto(A.userId, A.sellerId, p2.id, mem.storage);
      expect(await order(A.productId)).toEqual([
        [0, p1.id],
        [1, p3.id],
      ]);
      expect(await db.media.findUnique({ where: { id: p2.id } })).toBeNull();
      expect(mem.deleted.sort()).toEqual([`media/${p2.id}/lg.webp`, `media/${p2.id}/sm.webp`]);
      expect(await db.auditLog.count({ where: { entityId: p2.id, action: "media.product_photo_deleted" } })).toBe(1);
    });

    it("another seller can't delete, move or describe your photos", async () => {
      const photo = await upload(A);
      expect(await codeOf(media.deleteProductPhoto(B.userId, B.sellerId, photo.id, mem.storage))).toBe("not_found");
      expect(await codeOf(media.moveProductPhoto(B.userId, B.sellerId, photo.id, "main"))).toBe("not_found");
      expect(await codeOf(media.updateAltText(B.userId, B.sellerId, photo.id, "mine now"))).toBe("not_found");
      expect(await db.media.findUniqueOrThrow({ where: { id: photo.id } })).toMatchObject({ altText: null });
      expect(mem.deleted).toHaveLength(0);
      expect(await media.listProductPhotos(B.sellerId, A.productId)).toEqual([]);
    });

    it("updates a photo's description", async () => {
      const photo = await upload(A);
      await media.updateAltText(A.userId, A.sellerId, photo.id, "Short box braids");
      expect((await media.listProductPhotos(A.sellerId, A.productId))[0].altText).toBe("Short box braids");
    });
  });

  describe("logo and cover photo", () => {
    it("sets a logo without asking about people, and replacing it deletes the old one", async () => {
      const first = await upload(A, { target: "logo", productId: null, peopleConsent: false });
      expect(await db.seller.findUniqueOrThrow({ where: { id: A.sellerId } })).toMatchObject({ logoMediaId: first.id });
      expect(first.url).toBe(first.thumbUrl); // one size for logos
      expect([first.width, first.height]).toEqual([256, 256]);

      const second = await upload(A, { target: "logo", productId: null, peopleConsent: false });
      expect(await db.seller.findUniqueOrThrow({ where: { id: A.sellerId } })).toMatchObject({ logoMediaId: second.id });
      expect(await db.media.findUnique({ where: { id: first.id } })).toBeNull();
      expect(mem.deleted).toEqual([`media/${first.id}/lg.webp`]);
    });

    it("needs permission for a cover photo, and removing it clears the storefront", async () => {
      expect(await codeOf(upload(A, { target: "cover", productId: null, peopleConsent: false }))).toBe("consent_required");
      const cover = await upload(A, { target: "cover", productId: null });
      expect((await media.getSellerImages(A.sellerId)).cover?.id).toBe(cover.id);
      expect((await media.getSellerImages(B.sellerId)).cover).toBeNull();

      await media.removeSellerImage(A.userId, A.sellerId, "cover", mem.storage);
      expect(await db.seller.findUniqueOrThrow({ where: { id: A.sellerId } })).toMatchObject({ coverMediaId: null });
      expect(await db.media.count({ where: { sellerId: A.sellerId } })).toBe(0);
      expect(mem.files.size).toBe(0);
      await media.removeSellerImage(A.userId, A.sellerId, "cover", mem.storage); // nothing to remove: fine
    });

    it("two logo uploads at once leave exactly one logo and no orphaned photos", async () => {
      await Promise.all([1, 2, 3].map(() => upload(A, { target: "logo", productId: null })));
      const seller = await db.seller.findUniqueOrThrow({ where: { id: A.sellerId } });
      const rows = await db.media.findMany({ where: { sellerId: A.sellerId } });
      expect(rows.map((r) => r.id)).toEqual([seller.logoMediaId]);
      expect([...mem.files.keys()]).toEqual(rows[0].storageKeys);
    });
  });

  describe("public storefront", () => {
    it("shows the logo, cover and item photos, with no ids or storage keys", async () => {
      await upload(A, { target: "logo", productId: null });
      await upload(A, { target: "cover", productId: null });
      const [first, second] = [await upload(A, { altText: "Front" }), await upload(A)];
      await media.moveProductPhoto(A.userId, A.sellerId, second.id, "main");

      const storefront = (await pub.getStorefront(A.slug))!;
      const seller = pub.toPublicSeller(storefront.seller);
      expect(Object.keys(seller.logo!).sort()).toEqual(["altText", "height", "thumbUrl", "url", "width"]);
      expect(seller.cover?.url).toMatch(/lg\.webp$/);
      // Lists carry the main photo only.
      expect(storefront.items[0].photos.map((p) => p.url)).toEqual([second.url]);

      const item = await pub.getStorefrontItem(A.slug, "braids");
      expect(item?.kind === "item" && item.item.photos.map((p) => [p.url, p.altText])).toEqual([
        [second.url, null],
        [first.url, "Front"],
      ]);
      expect(JSON.stringify(item)).not.toContain("storageKeys");
    });
  });
});
