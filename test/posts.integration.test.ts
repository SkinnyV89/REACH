// Proof Posts against a real database, with an in-memory storage backend.
// Opt-in: set TEST_DATABASE_URL to a disposable, migrated database. It only
// deletes the users it creates (emails ending -<run tag>@reach-test.invalid).
import sharp from "sharp";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Storage } from "@/lib/storage";

const url = process.env.TEST_DATABASE_URL;
const run = describe.skipIf(!url);

function memoryStorage() {
  const files = new Map<string, Buffer>();
  const deleted: string[] = [];
  const storage: Storage = {
    name: "local",
    async put(key, data) {
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
  return { storage, files, deleted, reset: () => (files.clear(), (deleted.length = 0)) };
}

run("proof posts (integration)", () => {
  let db: typeof import("@/lib/db").db;
  let posts: typeof import("@/lib/posts");
  let media: typeof import("@/lib/media");
  let pub: typeof import("@/lib/public-storefronts");
  const mem = memoryStorage();
  const tag = Date.now();
  let hairId: string;
  type S = { userId: string; sellerId: string; slug: string; itemIds: string[] };
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
    const itemIds = [];
    for (const name of ["Knotless braids", "Cornrows", "Wig install"]) {
      const p = await db.product.create({
        data: { sellerId: s.id, categoryId: hairId, kind: "SERVICE", name, slug: name.toLowerCase().replace(/ /g, "-"), availability: "BY_BOOKING" },
      });
      itemIds.push(p.id);
    }
    return { userId: user.id, sellerId: s.id, slug: s.slug, itemIds };
  }

  const draft = (who: S, over: Partial<{ caption: string; productIds: string[] }> = {}) =>
    posts.createDraft(who.userId, who.sellerId, { caption: "Waist-length knotless braids", productIds: [], ...over });

  const upload = (who: S, postId: string, over: Record<string, unknown> = {}) =>
    media.uploadImage(
      { userId: who.userId, sellerId: who.sellerId, target: "post", productId: null, postId, data: jpeg, altText: null, peopleConsent: true, ...over },
      mem.storage,
    );

  // A published post with `n` photos.
  async function published(who: S, n = 1, over: Partial<{ caption: string; productIds: string[] }> = {}) {
    const p = await draft(who, over);
    for (let i = 0; i < n; i++) await upload(who, p.id);
    await posts.publishPost(who.userId, who.sellerId, p.id);
    return p;
  }

  const codeOf = (p: Promise<unknown>) =>
    p.then(
      () => "ok",
      (e) => (e?.code as string) ?? String(e),
    );

  async function clear(who: S) {
    await db.lead.deleteMany({ where: { sellerId: who.sellerId } });
    await db.attributionEvent.deleteMany({ where: { sellerId: who.sellerId } });
    await db.media.deleteMany({ where: { sellerId: who.sellerId } });
    await db.post.deleteMany({ where: { sellerId: who.sellerId } });
    await db.publicRateLimit.deleteMany({ where: { key: { in: [`upload:${who.sellerId}`] } } });
    await db.product.updateMany({ where: { sellerId: who.sellerId }, data: { status: "AVAILABLE" } });
    await db.seller.update({ where: { id: who.sellerId }, data: { storefrontPublishedAt: new Date() } });
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ db } = await import("@/lib/db"));
    posts = await import("@/lib/posts");
    media = await import("@/lib/media");
    pub = await import("@/lib/public-storefronts");
    hairId = (await db.category.findUniqueOrThrow({ where: { slug: "hair-wigs-weaves" } })).id;
    A = await seller("po-a");
    B = await seller("po-b");
    jpeg = await sharp({ create: { width: 800, height: 800, channels: 3, background: "#964" } })
      .withExif({ IFD3: { GPSLatitudeRef: "S", GPSLatitude: "26/1 16/1 0/1" } })
      .jpeg()
      .toBuffer();
  });

  beforeEach(async () => {
    mem.reset();
    await clear(A);
    await clear(B);
  });

  afterAll(async () => {
    if (!db) return;
    const users = await db.user.findMany({ where: { email: { endsWith: `-${tag}@reach-test.invalid` } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    const sellers = (await db.seller.findMany({ where: { userId: { in: ids } }, select: { id: true } })).map((s) => s.id);
    const leadIds = (await db.lead.findMany({ where: { sellerId: { in: sellers } }, select: { id: true } })).map((l) => l.id);
    await db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { entityId: { in: leadIds } }] } });
    await db.lead.deleteMany({ where: { sellerId: { in: sellers } } });
    await db.media.deleteMany({ where: { sellerId: { in: sellers } } });
    await db.publicRateLimit.deleteMany({ where: { OR: [{ key: { in: sellers.map((s) => `upload:${s}`) } }, { key: { contains: `ip-${tag}` } }] } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  describe("drafts and publishing", () => {
    it("creates a draft with a unique public code and the seller's own tags", async () => {
      const p = await draft(A, { productIds: [A.itemIds[0], A.itemIds[1]] });
      const row = await db.post.findUniqueOrThrow({ where: { id: p.id }, include: { products: true } });
      expect(row).toMatchObject({ sellerId: A.sellerId, status: "DRAFT", publishedAt: null, caption: "Waist-length knotless braids" });
      expect(row.code).toMatch(/^[a-zA-Z2-9]{10}$/);
      expect(row.products.map((t) => t.productId).sort()).toEqual([A.itemIds[0], A.itemIds[1]].sort());
      expect(await db.auditLog.count({ where: { entityId: p.id, action: "post.created", actorId: A.userId } })).toBe(1);
    });

    it("refuses tags on another seller's items or archived items", async () => {
      expect(await codeOf(draft(A, { productIds: [B.itemIds[0]] }))).toBe("INVALID_PRODUCT");
      await db.product.update({ where: { id: A.itemIds[2] }, data: { status: "ARCHIVED" } });
      expect(await codeOf(draft(A, { productIds: [A.itemIds[2]] }))).toBe("INVALID_PRODUCT");
      expect(await db.post.count({ where: { sellerId: A.sellerId } })).toBe(0);
    });

    it("limits unfinished drafts, even when created at the same moment", async () => {
      const results = await Promise.all(Array.from({ length: posts.MAX_DRAFTS + 3 }, () => codeOf(draft(A))));
      expect(results.filter((r) => r === "ok")).toHaveLength(posts.MAX_DRAFTS);
      expect(results.filter((r) => r === "TOO_MANY_DRAFTS")).toHaveLength(3);
    });

    it("won't publish without a photo, and publishes once", async () => {
      const p = await draft(A);
      expect(await codeOf(posts.publishPost(A.userId, A.sellerId, p.id))).toBe("NO_PHOTOS");
      await upload(A, p.id);
      await posts.publishPost(A.userId, A.sellerId, p.id);
      const row = await db.post.findUniqueOrThrow({ where: { id: p.id } });
      expect(row.status).toBe("PUBLISHED");
      expect(row.publishedAt).not.toBeNull();
      expect(await codeOf(posts.publishPost(A.userId, A.sellerId, p.id))).toBe("NOT_DRAFT");
    });
  });

  describe("photos", () => {
    it("stores re-encoded photos labelled From gallery, whatever the browser claims", async () => {
      const p = await draft(A);
      const photo = await upload(A, p.id, { captureSource: "IN_APP_CAMERA", capturedAt: new Date() });
      const row = await db.media.findUniqueOrThrow({ where: { id: photo.id } });
      expect(row).toMatchObject({ kind: "POST", mediaType: "IMAGE", captureSource: "GALLERY", capturedAt: null, sellerId: A.sellerId });
      expect(row.peopleConsentAt).not.toBeNull();
      expect((await sharp(mem.files.get(row.storageKeys[0])!).metadata()).exif).toBeUndefined();
    });

    it("the database refuses a capture time on a gallery photo", async () => {
      const p = await draft(A);
      const photo = await upload(A, p.id);
      await expect(db.media.update({ where: { id: photo.id }, data: { capturedAt: new Date() } })).rejects.toThrow();
    });

    it("needs permission from people shown, and only takes photos while a draft", async () => {
      const p = await draft(A);
      expect(await codeOf(upload(A, p.id, { peopleConsent: false }))).toBe("consent_required");
      await upload(A, p.id);
      await posts.publishPost(A.userId, A.sellerId, p.id);
      expect(await codeOf(upload(A, p.id))).toBe("post_not_draft");
      expect(await db.postMedia.count({ where: { postId: p.id } })).toBe(1);
    });

    it("another seller can't add photos to your post", async () => {
      const p = await draft(A);
      expect(await codeOf(upload(B, p.id))).toBe("not_found");
      expect(mem.files.size).toBe(0);
    });

    it("allows six photos per post, also when uploads arrive at once", async () => {
      const p = await draft(A);
      for (let i = 0; i < 3; i++) await upload(A, p.id);
      const results = await Promise.all(Array.from({ length: 5 }, () => codeOf(upload(A, p.id))));
      expect(results.filter((r) => r === "ok")).toHaveLength(3);
      expect(results.filter((r) => r === "limit_reached")).toHaveLength(2);
      const positions = (await db.postMedia.findMany({ where: { postId: p.id }, orderBy: { position: "asc" } })).map((r) => r.position);
      expect(positions).toEqual([0, 1, 2, 3, 4, 5]);
      expect(mem.files.size).toBe(12); // losers' files cleaned up
    });

    it("removes a photo and closes the gap, but a published post keeps its last photo", async () => {
      const p = await published(A, 3);
      const ids = (await db.postMedia.findMany({ where: { postId: p.id }, orderBy: { position: "asc" } })).map((r) => r.mediaId);
      await posts.deletePostPhoto(A.userId, A.sellerId, ids[0], mem.storage);
      expect((await db.postMedia.findMany({ where: { postId: p.id }, orderBy: { position: "asc" } })).map((r) => [r.position, r.mediaId])).toEqual([
        [0, ids[1]],
        [1, ids[2]],
      ]);
      expect(mem.deleted).toEqual([`media/${ids[0]}/lg.webp`, `media/${ids[0]}/sm.webp`]);
      await posts.deletePostPhoto(A.userId, A.sellerId, ids[1], mem.storage);
      expect(await codeOf(posts.deletePostPhoto(A.userId, A.sellerId, ids[2], mem.storage))).toBe("LAST_PHOTO");
      expect(await codeOf(posts.deletePostPhoto(B.userId, B.sellerId, ids[2], mem.storage))).toBe("NOT_FOUND");
    });
  });

  describe("editing, hiding and deleting", () => {
    it("updates the caption and tags, keeping tags on archived items", async () => {
      const p = await published(A, 1, { productIds: [A.itemIds[0], A.itemIds[2]] });
      await db.product.update({ where: { id: A.itemIds[2] }, data: { status: "ARCHIVED" } });
      await posts.updatePost(A.userId, A.sellerId, p.id, { caption: "Updated", productIds: [A.itemIds[1]] });
      const row = await db.post.findUniqueOrThrow({ where: { id: p.id }, include: { products: true } });
      expect(row.caption).toBe("Updated");
      expect(row.products.map((t) => t.productId).sort()).toEqual([A.itemIds[1], A.itemIds[2]].sort());
      // Only the current item is shown publicly.
      const found = await pub.getStorefrontPost(A.slug, p.code);
      expect(found?.post.products.map((i) => i.name)).toEqual(["Cornrows"]);
    });

    it("hides and shows a post", async () => {
      const p = await published(A);
      await posts.setPostHidden(A.userId, A.sellerId, p.id, true);
      expect((await db.post.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("HIDDEN");
      expect(await codeOf(posts.setPostHidden(A.userId, A.sellerId, p.id, true))).toBe("NOT_FOUND");
      await posts.setPostHidden(A.userId, A.sellerId, p.id, false);
      expect((await db.post.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("PUBLISHED");
    });

    it("a post removed by REACH can't be shown or edited by the seller", async () => {
      const p = await published(A);
      await db.post.update({ where: { id: p.id }, data: { status: "REMOVED" } });
      expect(await codeOf(posts.setPostHidden(A.userId, A.sellerId, p.id, false))).toBe("NOT_FOUND");
      expect(await codeOf(posts.updatePost(A.userId, A.sellerId, p.id, { caption: "x", productIds: [] }))).toBe("REMOVED");
      expect(await pub.getStorefrontPost(A.slug, p.code)).toBeNull();
    });

    it("deletes a post with its photos and files; enquiries keep their record", async () => {
      const p = await published(A, 2);
      const leadInput = { name: "Sipho", contact: "+27725550199", message: null, consent: "on" as const };
      await pub.submitStorefrontLead(A.slug, null, leadInput, { channel: "UNKNOWN", utmSource: null, campaignCode: null }, `ip-${tag}-1`, p.code);
      await posts.deletePost(A.userId, A.sellerId, p.id, mem.storage);
      expect(await db.post.findUnique({ where: { id: p.id } })).toBeNull();
      expect(await db.media.count({ where: { sellerId: A.sellerId } })).toBe(0);
      expect(mem.files.size).toBe(0);
      expect(mem.deleted).toHaveLength(4);
      const lead = await db.lead.findFirstOrThrow({ where: { sellerId: A.sellerId } });
      expect(lead).toMatchObject({ source: "POST", postId: null });
    });

    it("another seller can't publish, edit, hide or delete your post", async () => {
      const p = await draft(A);
      await upload(A, p.id);
      expect(await codeOf(posts.publishPost(B.userId, B.sellerId, p.id))).toBe("NOT_FOUND");
      expect(await codeOf(posts.updatePost(B.userId, B.sellerId, p.id, { caption: "mine", productIds: [] }))).toBe("NOT_FOUND");
      await posts.publishPost(A.userId, A.sellerId, p.id);
      expect(await codeOf(posts.setPostHidden(B.userId, B.sellerId, p.id, true))).toBe("NOT_FOUND");
      expect(await codeOf(posts.deletePost(B.userId, B.sellerId, p.id, mem.storage))).toBe("NOT_FOUND");
      expect(await db.post.findUniqueOrThrow({ where: { id: p.id } })).toMatchObject({ status: "PUBLISHED", caption: "Waist-length knotless braids" });
      expect(await posts.getSellerPost(B.sellerId, p.id)).toBeNull();
    });
  });

  describe("public storefront", () => {
    it("shows only published posts, newest first, with photo counts", async () => {
      const first = await published(A, 2, { caption: "First" });
      const second = await published(A, 1, { caption: "Second" });
      const hidden = await published(A, 1, { caption: "Hidden" });
      await posts.setPostHidden(A.userId, A.sellerId, hidden.id, true);
      await draft(A, { caption: "Draft" });
      const { posts: tiles, total } = await pub.listPublicPosts(A.sellerId, { take: 9 });
      expect(total).toBe(2);
      expect(tiles.map((t) => [t.code, t.photoCount])).toEqual([
        [second.code, 1],
        [first.code, 2],
      ]);
      expect(Object.keys(tiles[0].photo).sort()).toEqual(["altText", "height", "thumbUrl", "url", "width"]);
      expect((await pub.listPublicPosts(A.sellerId, { take: 1, skip: 1 })).posts.map((t) => t.code)).toEqual([first.code]);
    });

    it("post pages are live only for published posts on published storefronts", async () => {
      const p = await published(A, 2, { productIds: [A.itemIds[0]] });
      const live = await pub.getStorefrontPost(A.slug, p.code);
      expect(live?.state).toBe("live");
      expect(live?.post.photos.map((ph) => ph.captureSource)).toEqual(["GALLERY", "GALLERY"]);
      expect(live?.post.products.map((i) => i.slug)).toEqual(["knotless-braids"]);
      expect(JSON.stringify(live?.post)).not.toMatch(/storageKeys|sellerId|"id"/);

      await posts.setPostHidden(A.userId, A.sellerId, p.id, true);
      expect((await pub.getStorefrontPost(A.slug, p.code))?.state).toBe("preview");
      await posts.setPostHidden(A.userId, A.sellerId, p.id, false);
      await db.seller.update({ where: { id: A.sellerId }, data: { storefrontPublishedAt: null } });
      expect((await pub.getStorefrontPost(A.slug, p.code))?.state).toBe("preview");
      // Another seller's slug with this code finds nothing.
      expect(await pub.getStorefrontPost(B.slug, p.code)).toBeNull();
      expect(await pub.getStorefrontPost(A.slug, "../../etc")).toBeNull();
    });

    it("enquiries from a post are tagged POST and linked to it, only while it's public", async () => {
      const p = await published(A);
      const input = { name: "Lerato", contact: "+27725550123", message: "Price for this?", consent: "on" as const };
      const attribution = { channel: "WHATSAPP" as const, utmSource: "whatsapp", campaignCode: null };
      expect(await pub.submitStorefrontLead(A.slug, null, input, attribution, `ip-${tag}-2`, p.code)).toEqual({ ok: true, duplicate: false });
      expect(await db.lead.findFirstOrThrow({ where: { sellerId: A.sellerId } })).toMatchObject({ source: "POST", postId: p.id, productId: null, channel: "WHATSAPP" });

      await posts.setPostHidden(A.userId, A.sellerId, p.id, true);
      expect(await pub.submitStorefrontLead(A.slug, null, { ...input, contact: "+27725550124" }, attribution, `ip-${tag}-3`, p.code)).toEqual({
        ok: false,
        reason: "not_found",
      });
      // A post code can't be used on another seller's storefront.
      await posts.setPostHidden(A.userId, A.sellerId, p.id, false);
      expect((await pub.submitStorefrontLead(B.slug, null, input, attribution, `ip-${tag}-4`, p.code)).ok).toBe(false);
    });

    it("counts post views and WhatsApp taps against the post", async () => {
      const p = await published(A);
      const view = { sellerSlug: A.slug, itemSlug: null, postCode: p.code, sessionId: `s-${tag}`, type: "VIEW" as const, channel: "UNKNOWN" as const, campaignCode: null };
      expect(await pub.recordStorefrontEvent(view)).toBe(true);
      expect(await pub.recordStorefrontEvent(view)).toBe(false); // repeat within 30 minutes
      expect(await db.attributionEvent.findFirstOrThrow({ where: { sellerId: A.sellerId } })).toMatchObject({ target: "POST", postId: p.id, productId: null });
      const wa = await pub.getWhatsappTarget(A.slug, null, p.code);
      expect(wa).toMatchObject({ fromPost: true, itemName: null });
      await posts.setPostHidden(A.userId, A.sellerId, p.id, true);
      expect(await pub.recordStorefrontEvent({ ...view, sessionId: `s2-${tag}` })).toBe(false);
      expect((await pub.getWhatsappTarget(A.slug, null, p.code))?.fromPost).toBe(false);
    });
  });
});
