// Buyer accounts, following, the feed and notifications, against a real
// database. Opt-in: set TEST_DATABASE_URL to a disposable, migrated database.
// It only deletes the users it creates (emails ending -<run tag>@reach-test.invalid).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const url = process.env.TEST_DATABASE_URL;
const run = describe.skipIf(!url);

run("buyers, following, feed and notifications (integration)", () => {
  let db: typeof import("@/lib/db").db;
  let follows: typeof import("@/lib/follows");
  let feed: typeof import("@/lib/feed");
  let notifications: typeof import("@/lib/notifications");
  let posts: typeof import("@/lib/posts");
  let account: typeof import("@/lib/account");
  const tag = Date.now();
  let hairId: string, foodId: string;
  type Seller = { userId: string; sellerId: string; slug: string };
  let A: Seller, B: Seller, C: Seller;
  let buyer: string, other: string;

  async function user(label: string) {
    return (await db.user.create({ data: { email: `${label}-${tag}@reach-test.invalid`, name: label } })).id;
  }

  async function seller(label: string, categoryId: string): Promise<Seller> {
    const userId = await user(label);
    const s = await db.seller.create({
      data: {
        userId,
        slug: `${label}-${tag}`,
        businessName: `${label} Shop`,
        status: "ACTIVE",
        whatsappNumber: "+27821234567",
        storefrontPublishedAt: new Date(),
        categories: { create: [{ categoryId }] },
      },
    });
    return { userId, sellerId: s.id, slug: s.slug };
  }

  // A published post with one photo (rows only; the photo pipeline has its own tests).
  async function post(who: Seller, caption = "Fresh work", publishedAt?: Date) {
    const p = await posts.createDraft(who.userId, who.sellerId, { caption, productIds: [] });
    const media = await db.media.create({
      data: { sellerId: who.sellerId, kind: "POST", storageKeys: [], url: "https://files.test/lg.webp", thumbUrl: "https://files.test/sm.webp", width: 10, height: 10, bytes: 1 },
    });
    await db.postMedia.create({ data: { postId: p.id, mediaId: media.id, position: 0 } });
    await posts.publishPost(who.userId, who.sellerId, p.id);
    if (publishedAt) await db.post.update({ where: { id: p.id }, data: { publishedAt } });
    return p;
  }

  const codeOf = (p: Promise<unknown>) =>
    p.then(
      () => "ok",
      (e) => (e?.code as string) ?? String(e),
    );

  const sellers = () => [A, B, C];

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ db } = await import("@/lib/db"));
    follows = await import("@/lib/follows");
    feed = await import("@/lib/feed");
    notifications = await import("@/lib/notifications");
    posts = await import("@/lib/posts");
    account = await import("@/lib/account");
    hairId = (await db.category.findUniqueOrThrow({ where: { slug: "hair-wigs-weaves" } })).id;
    foodId = (await db.category.findUniqueOrThrow({ where: { slug: "food-baking-catering" } })).id;
    A = await seller("so-a", hairId);
    B = await seller("so-b", hairId);
    C = await seller("so-c", foodId);
    buyer = await user("so-buyer");
    other = await user("so-other");
  });

  beforeEach(async () => {
    const ids = sellers().map((s) => s.sellerId);
    await db.notification.deleteMany({ where: { sellerId: { in: ids } } });
    await db.follow.deleteMany({ where: { sellerId: { in: ids } } });
    await db.media.deleteMany({ where: { sellerId: { in: ids } } });
    await db.post.deleteMany({ where: { sellerId: { in: ids } } });
    await db.seller.updateMany({ where: { id: { in: ids } }, data: { storefrontPublishedAt: new Date(), status: "ACTIVE" } });
    await db.publicRateLimit.deleteMany({ where: { key: { in: [buyer, other, A.userId].map((u) => `follow:${u}`) } } });
  });

  afterAll(async () => {
    if (!db) return;
    const users = await db.user.findMany({ where: { email: { endsWith: `-${tag}@reach-test.invalid` } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    await db.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { entityId: { in: ids } }] } });
    await db.media.deleteMany({ where: { sellerId: { in: sellers().map((s) => s.sellerId) } } });
    await db.publicRateLimit.deleteMany({ where: { key: { in: ids.map((u) => `follow:${u}`) } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  describe("accounts", () => {
    it("new accounts are members; selling comes from a seller profile", async () => {
      expect((await db.user.findUniqueOrThrow({ where: { id: buyer } })).role).toBe("MEMBER");
      expect(account.homePathFor(null)).toBe("/feed");
      expect(account.homePathFor({ status: "ONBOARDING" })).toBe("/feed");
      expect(account.homePathFor({ status: "ACTIVE" })).toBe("/dashboard");
    });

    it("a buyer can delete their account, with follows and notifications", async () => {
      const gone = await user("so-gone");
      await follows.follow(gone, A.slug);
      await post(A);
      expect(await db.notification.count({ where: { userId: gone } })).toBe(1);
      await account.deleteBuyerAccount(gone);
      expect(await db.user.findUnique({ where: { id: gone } })).toBeNull();
      expect(await db.follow.count({ where: { userId: gone } })).toBe(0);
      expect(await db.notification.count({ where: { userId: gone } })).toBe(0);
      expect(await db.auditLog.count({ where: { action: "user.deleted", entityId: gone, actorId: null } })).toBe(1);
    });

    it("an account with a seller profile isn't deleted this way", async () => {
      expect(await codeOf(account.deleteBuyerAccount(A.userId))).toBe("HAS_SELLER");
      expect(await db.user.findUnique({ where: { id: A.userId } })).not.toBeNull();
    });
  });

  describe("following", () => {
    it("follows a published storefront once, and unfollows", async () => {
      await follows.follow(buyer, A.slug);
      await follows.follow(buyer, A.slug); // twice is fine
      expect(await follows.isFollowing(buyer, A.sellerId)).toBe(true);
      expect(await follows.followerCount(A.sellerId)).toBe(1);
      await follows.unfollow(buyer, A.slug);
      expect(await follows.isFollowing(buyer, A.sellerId)).toBe(false);
    });

    it("can't follow unpublished or missing storefronts", async () => {
      await db.seller.update({ where: { id: B.sellerId }, data: { storefrontPublishedAt: null } });
      expect(await codeOf(follows.follow(buyer, B.slug))).toBe("NOT_FOUND");
      expect(await codeOf(follows.follow(buyer, `nobody-${tag}`))).toBe("NOT_FOUND");
    });

    it("sellers can follow others but not themselves (also refused by the database)", async () => {
      await follows.follow(A.userId, B.slug);
      expect(await codeOf(follows.follow(A.userId, A.slug))).toBe("SELF");
      await expect(db.follow.create({ data: { userId: A.userId, sellerId: A.sellerId } })).rejects.toThrow(/own storefront/);
    });

    it("rate-limits follow changes", async () => {
      await db.publicRateLimit.create({ data: { key: `follow:${other}`, count: 120, windowStart: new Date() } });
      expect(await codeOf(follows.follow(other, A.slug))).toBe("RATE_LIMITED");
    });

    it("keeps follows when a storefront is unpublished, marked unavailable, and lets you unfollow", async () => {
      await follows.follow(buyer, A.slug);
      await follows.follow(buyer, C.slug);
      await db.seller.update({ where: { id: C.sellerId }, data: { storefrontPublishedAt: null } });
      const list = await follows.listFollowing(buyer);
      expect(list.map((s) => [s.slug, s.available]).sort()).toEqual([
        [A.slug, true],
        [C.slug, false],
      ]);
      expect(JSON.stringify(list)).not.toMatch(/userId|sellerId|whatsapp/i);
      await follows.unfollow(buyer, C.slug);
      expect(await follows.isFollowing(buyer, C.sellerId)).toBe(false);
    });
  });

  describe("feed", () => {
    it("shows published posts from followed sellers only, newest first", async () => {
      await follows.follow(buyer, A.slug);
      await follows.follow(buyer, B.slug);
      const a1 = await post(A, "A1", new Date("2026-10-20T10:00:00Z"));
      const b1 = await post(B, "B1", new Date("2026-10-21T10:00:00Z"));
      await post(C, "C1 not followed");
      const hidden = await post(A, "hidden");
      await posts.setPostHidden(A.userId, A.sellerId, hidden.id, true);
      await posts.createDraft(A.userId, A.sellerId, { caption: "draft", productIds: [] });

      const page = await feed.getFollowingFeed(buyer, null);
      expect(page.posts.map((p) => p.code)).toEqual([b1.code, a1.code]);
      expect(page.nextCursor).toBeNull();
      expect(page.posts[0]).toMatchObject({ caption: "B1", photoCount: 1, seller: { slug: B.slug } });
      expect(page.posts[0].photo.captureSource).toBe("GALLERY");
      expect(JSON.stringify(page)).not.toMatch(/"id"|sellerId|userId/);

      // Unpublishing a storefront removes its posts from the feed.
      await db.seller.update({ where: { id: B.sellerId }, data: { storefrontPublishedAt: null } });
      expect((await feed.getFollowingFeed(buyer, null)).posts.map((p) => p.code)).toEqual([a1.code]);
      // Another user's feed is their own.
      expect((await feed.getFollowingFeed(other, null)).posts).toEqual([]);
    });

    it("pages with a cursor without skipping or repeating, even with equal timestamps", async () => {
      await follows.follow(buyer, A.slug);
      const same = new Date("2026-10-15T08:00:00Z");
      const made = [];
      for (let i = 0; i < 5; i++) made.push(await post(A, `p${i}`, i < 3 ? same : new Date(same.getTime() - i * 60_000)));
      const seen: string[] = [];
      let cursor = null;
      for (let guard = 0; guard < 10; guard++) {
        const page: Awaited<ReturnType<typeof feed.getFollowingFeed>> = await feed.getFollowingFeed(buyer, cursor, 2);
        seen.push(...page.posts.map((p) => p.code));
        if (!page.nextCursor) break;
        cursor = (await import("@/lib/feed-rules")).decodeCursor(page.nextCursor);
      }
      expect(seen).toHaveLength(5);
      expect(new Set(seen).size).toBe(5);
      expect(seen.sort()).toEqual(made.map((m) => m.code).sort());
    });

    it("lists recently active sellers by latest post, within 30 days, by category", async () => {
      await post(A, "old", new Date(Date.now() - 40 * 86_400_000));
      await post(B, "b", new Date(Date.now() - 2 * 86_400_000));
      await post(C, "c", new Date(Date.now() - 1 * 86_400_000));
      const mine = new Set(sellers().map((s) => s.slug));
      const all = (await feed.recentlyActiveSellers({ limit: 50 })).filter((s) => mine.has(s.slug));
      expect(all.map((s) => s.slug)).toEqual([C.slug, B.slug]); // A's only post is 40 days old
      const hair = (await feed.recentlyActiveSellers({ categorySlugs: ["hair-wigs-weaves"], limit: 50 })).filter((s) => mine.has(s.slug));
      expect(hair.map((s) => s.slug)).toEqual([B.slug]);
      const notMine = (await feed.recentlyActiveSellers({ excludeSellerId: C.sellerId, limit: 50 })).filter((s) => mine.has(s.slug));
      expect(notMine.map((s) => s.slug)).toEqual([B.slug]);
      expect(all[0]).toMatchObject({ recentPosts: 1, categories: ["Food, baking & catering"] });
    });
  });

  describe("notifications", () => {
    it("notifies followers only when a post is published, grouping while unread", async () => {
      await follows.follow(buyer, A.slug);
      await follows.follow(other, B.slug);
      const p1 = await post(A, "one");
      expect(await notifications.unreadCount(buyer)).toBe(1);
      expect(await notifications.unreadCount(other)).toBe(0);
      const p2 = await post(A, "two");
      const rows = await db.notification.findMany({ where: { userId: buyer } });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ count: 2, postId: p2.id, type: "NEW_POST", sellerId: A.sellerId });
      // Retrying for the same post never counts it twice.
      await notifications.notifyFollowersOfPost(A.sellerId, p2.id);
      await notifications.notifyFollowersOfPost(A.sellerId, p1.id);
      expect((await db.notification.findFirstOrThrow({ where: { userId: buyer } })).count).toBe(2);

      const list = await notifications.listNotifications(buyer);
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ count: 2, unread: true, href: `/s/${A.slug}/posts/${(await db.post.findUniqueOrThrow({ where: { id: p2.id } })).code}?src=reach` });

      await notifications.markAllRead(buyer);
      expect(await notifications.unreadCount(buyer)).toBe(0);
      await post(A, "three");
      const after = await db.notification.findMany({ where: { userId: buyer }, orderBy: { createdAt: "asc" } });
      expect(after.map((n) => [n.count, n.readAt === null])).toEqual([
        [2, false],
        [1, true],
      ]);
    });

    it("sends nothing while the storefront is unpublished", async () => {
      await follows.follow(buyer, A.slug);
      await db.seller.update({ where: { id: A.sellerId }, data: { storefrontPublishedAt: null } });
      await post(A);
      expect(await db.notification.count({ where: { userId: buyer } })).toBe(0);
    });

    it("hides notifications whose only post is gone; grouped ones link to the seller's posts", async () => {
      await follows.follow(buyer, A.slug);
      await follows.follow(buyer, B.slug);
      const a = await post(A);
      const b1 = await post(B);
      const b2 = await post(B);
      await posts.deletePost(A.userId, A.sellerId, a.id);
      await posts.setPostHidden(B.userId, B.sellerId, b2.id, true);
      const list = await notifications.listNotifications(buyer);
      expect(list.map((n) => [n.seller.slug, n.count, n.href])).toEqual([[B.slug, 2, `/s/${B.slug}/posts?src=reach`]]);
      expect(await db.notification.count({ where: { userId: buyer, sellerId: A.sellerId } })).toBe(1); // kept, post link cleared
      void b1;
    });

    it("a burst of posts to many followers stays one notification each", async () => {
      const followers = [];
      for (let i = 0; i < 25; i++) {
        const u = await user(`so-f${i}`);
        await db.follow.create({ data: { userId: u, sellerId: C.sellerId } });
        followers.push(u);
      }
      await Promise.all([post(C, "x"), post(C, "y"), post(C, "z")]);
      const rows = await db.notification.findMany({ where: { sellerId: C.sellerId } });
      expect(rows).toHaveLength(25);
      expect(rows.every((r) => r.count === 3 && r.readAt === null)).toBe(true);
    });
  });
});
