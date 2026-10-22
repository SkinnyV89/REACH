// Explore: ranking, location groups, search, latest work, landing pages and
// REACH attribution, against a real database. Opt-in: set TEST_DATABASE_URL
// to a disposable, migrated database. It only deletes the users it creates.
// Other sellers may exist in the database, so checks look at this run's
// sellers within the full results.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateShareCode } from "@/lib/campaign-rules";

const url = process.env.TEST_DATABASE_URL;
const run = describe.skipIf(!url);

run("explore (integration)", () => {
  let db: typeof import("@/lib/db").db;
  let explore: typeof import("@/lib/explore");
  let pub: typeof import("@/lib/public-storefronts");
  const tag = Date.now();
  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
  type S = { id: string; slug: string; userId: string };
  const made: Record<string, S> = {};
  let places: Record<string, Awaited<ReturnType<typeof import("@/lib/explore").placeBySlug>>>;

  async function seller(
    key: string,
    o: {
      place: string;
      category: string;
      published: Date | null;
      items: string[];
      postedAt?: Date[];
      delivers?: number;
      description?: string;
    },
  ) {
    const user = await db.user.create({ data: { email: `ex-${key}-${tag}@reach-test.invalid`, name: key } });
    const cat = await db.category.findUniqueOrThrow({ where: { slug: o.category } });
    const s = await db.seller.create({
      data: {
        userId: user.id,
        slug: `ex-${key}-${tag}`,
        businessName: `${key} ${tag}`,
        status: "ACTIVE",
        whatsappNumber: "+27821234567",
        placeId: places[o.place]!.id,
        storefrontPublishedAt: o.published,
        description: o.description ?? null,
        fulfilment: o.delivers ? ["DELIVERY"] : ["COLLECTION"],
        serviceRadiusKm: o.delivers ?? null,
        categories: { create: [{ categoryId: cat.id }] },
        products: {
          create: o.items.map((name) => ({
            categoryId: cat.id,
            name,
            slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
            kind: "SERVICE" as const,
            priceType: "FROM" as const,
            price: "300",
            availability: "BY_BOOKING" as const,
            availabilityUpdatedAt: o.published ?? now,
          })),
        },
      },
    });
    for (const [i, at] of (o.postedAt ?? []).entries()) {
      const media = await db.media.create({
        data: { sellerId: s.id, kind: "POST", storageKeys: [], url: `https://files.test/${key}${i}.webp`, thumbUrl: `https://files.test/${key}${i}s.webp`, width: 10, height: 10, bytes: 1 },
      });
      await db.post.create({
        data: { sellerId: s.id, code: generateShareCode(10), caption: `${key} work ${i}`, status: "PUBLISHED", publishedAt: at, media: { create: [{ mediaId: media.id, position: 0 }] } },
      });
    }
    made[key] = { id: s.id, slug: s.slug, userId: user.id };
  }

  // Every result for this run's sellers, across all pages.
  async function all(args: Omit<Parameters<typeof explore.exploreSellers>[0], "page">) {
    const out = [];
    for (let page = 1; ; page++) {
      const r = await explore.exploreSellers({ ...args, page, now });
      out.push(...r.cards);
      if (page >= r.pages) break;
    }
    return out;
  }
  const mine = <T extends { slug: string }>(cards: T[]) => cards.filter((c) => c.slug.endsWith(`-${tag}`));
  const key = (slug: string) => slug.replace(/^ex-/, "").replace(`-${tag}`, "");

  beforeAll(async () => {
    process.env.DATABASE_URL = url;
    ({ db } = await import("@/lib/db"));
    explore = await import("@/lib/explore");
    pub = await import("@/lib/public-storefronts");
    places = {};
    for (const p of ["soweto-gauteng", "roodepoort-gauteng", "pretoria-gauteng", "cape-town-western-cape"]) places[p] = await explore.placeBySlug(p);
    await seller("newsoweto", { place: "soweto-gauteng", category: "hair-wigs-weaves", published: daysAgo(1), items: ["Knotless braids"], postedAt: [daysAgo(0)], description: "Braids in Pimville" });
    await seller("roodepoort", { place: "roodepoort-gauteng", category: "hair-wigs-weaves", published: daysAgo(90), items: ["Box braids"], postedAt: [daysAgo(30)] });
    await seller("pretoria", { place: "pretoria-gauteng", category: "hair-wigs-weaves", published: daysAgo(90), items: ["Wig install"], delivers: 80 });
    await seller("capetown", { place: "cape-town-western-cape", category: "barbers-mens-grooming", published: daysAgo(90), items: ["Skin fade"], postedAt: [daysAgo(3)] });
    await seller("hidden", { place: "soweto-gauteng", category: "hair-wigs-weaves", published: null, items: ["Knotless braids"] });
  });

  afterAll(async () => {
    if (!db) return;
    const users = await db.user.findMany({ where: { email: { endsWith: `-${tag}@reach-test.invalid` } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    const sellers = Object.values(made).map((s) => s.id);
    const leadIds = (await db.lead.findMany({ where: { sellerId: { in: sellers } }, select: { id: true } })).map((l) => l.id);
    await db.auditLog.deleteMany({ where: { entityId: { in: leadIds } } });
    await db.lead.deleteMany({ where: { sellerId: { in: sellers } } });
    await db.media.deleteMany({ where: { sellerId: { in: sellers } } });
    await db.publicRateLimit.deleteMany({ where: { key: { contains: `ex-${tag}` } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await db.$disconnect();
  });

  it("shows only live storefronts", async () => {
    const cards = mine(await all({ place: null, categories: null, query: null }));
    expect(cards.map((c) => key(c.slug)).sort()).toEqual(["capetown", "newsoweto", "pretoria", "roodepoort"]);
  });

  it("near Soweto: near sellers first (incl. one that delivers there), the rest under Further away", async () => {
    const cards = mine(await all({ place: places["soweto-gauteng"], categories: null, query: null }));
    const groups = Object.fromEntries(cards.map((c) => [key(c.slug), c.group]));
    expect(groups).toEqual({ newsoweto: "near", roodepoort: "near", pretoria: "near", capetown: "further" });
    const order = cards.map((c) => key(c.slug));
    expect(order.indexOf("newsoweto")).toBeLessThan(order.indexOf("roodepoort"));
    expect(order.indexOf("capetown")).toBe(order.length - 1);

    const bySlug = Object.fromEntries(cards.map((c) => [key(c.slug), c]));
    expect(bySlug.newsoweto.reasons).toEqual(["In Soweto", "Posted today", "New on REACH"]);
    expect(bySlug.roodepoort.reasons).toEqual(["Roodepoort · about 12 km away", "Posted 30 days ago"]);
    expect(bySlug.pretoria.reasons).toEqual(["Pretoria · about 65 km away", "Delivers to your area"]);
    expect(bySlug.capetown.reasons[0]).toMatch(/^Cape Town · about \d+ km away$/);
    // Cards carry no internal fields beyond the server-only seller id.
    expect(Object.keys(bySlug.newsoweto).sort()).toEqual(["area", "businessName", "category", "group", "image", "logo", "matches", "open", "openLabel", "reasons", "sellerId", "slug", "tagline"]);
  });

  it("without a town, there's one list and no distances", async () => {
    const cards = mine(await all({ place: null, categories: null, query: null }));
    expect(new Set(cards.map((c) => c.group))).toEqual(new Set(["all"]));
    expect(cards.every((c) => !c.reasons.some((r) => r.includes("km") || r.startsWith("In ")))).toBe(true);
  });

  it("filters by category", async () => {
    const barbers = mine(await all({ place: null, categories: ["barbers-mens-grooming"], query: null }));
    expect(barbers.map((c) => key(c.slug))).toEqual(["capetown"]);
  });

  it("searches names and items, tolerating typos, and lists matching items", async () => {
    const typo = mine(await all({ place: null, categories: null, query: "knotles braids" }));
    expect(typo.map((c) => key(c.slug))).toEqual(["newsoweto"]);
    expect(typo[0].matches.map((m) => m.name)).toEqual(["Knotless braids"]);
    const fade = mine(await all({ place: null, categories: null, query: "fade" }));
    expect(fade.map((c) => key(c.slug))).toEqual(["capetown"]);
    expect(fade[0].matches[0]).toMatchObject({ name: "Skin fade", priceType: "FROM", price: "300.00" });
    const byName = mine(await all({ place: null, categories: null, query: `roodepoort ${tag}` }));
    expect(byName.map((c) => key(c.slug))).toEqual(["roodepoort"]);
    // LIKE wildcards in the query are treated as text.
    expect(mine(await all({ place: null, categories: null, query: "%%" }))).toEqual([]);
    const none = await explore.exploreSellers({ place: null, categories: null, query: "zzqxwvkj", now });
    expect(none.total).toBe(0);
  });

  it("pages never repeat or skip a seller, and the order is the same on every load", async () => {
    const first = await all({ place: places["soweto-gauteng"], categories: null, query: null });
    const again = await all({ place: places["soweto-gauteng"], categories: null, query: null });
    expect(again.map((c) => c.slug)).toEqual(first.map((c) => c.slug));
    expect(new Set(first.map((c) => c.slug)).size).toBe(first.length);
    const { total } = await explore.exploreSellers({ place: places["soweto-gauteng"], categories: null, query: null, now });
    expect(first).toHaveLength(total);
  });

  it("latest work: recent posts, nearer first when ages are similar", async () => {
    const work = async (args: Omit<Parameters<typeof explore.exploreLatestWork>[0], "page">) => {
      const out = [];
      for (let page = 1; ; page++) {
        const r = await explore.exploreLatestWork({ ...args, page, now });
        out.push(...r.tiles);
        if (page >= r.pages) break;
      }
      return out.filter((t) => t.seller.slug.endsWith(`-${tag}`));
    };
    const near = await work({ place: places["soweto-gauteng"], categories: null });
    expect(near.map((t) => key(t.seller.slug))).toEqual(["newsoweto", "capetown", "roodepoort"]);
    expect(near[0]).toMatchObject({ distance: "In Soweto", photoCount: 1 });
    expect(near[0].photo.captureSource).toBe("GALLERY");
    const barbers = await work({ place: null, categories: ["barbers-mens-grooming"] });
    expect(barbers.map((t) => key(t.seller.slug))).toEqual(["capetown"]);
  });

  it("snaps a shared location to a town, and stores only the town", async () => {
    expect((await explore.snapToPlace({ latitude: -26.27, longitude: 27.86 }))?.slug).toBe("soweto-gauteng");
    expect(await explore.snapToPlace({ latitude: -40, longitude: 10 })).toBeNull(); // the ocean
    await explore.saveBuyerPlace(made.capetown.userId, places["soweto-gauteng"]!.id);
    const user = await db.user.findUniqueOrThrow({ where: { id: made.capetown.userId } });
    expect(user.placeId).toBe(places["soweto-gauteng"]!.id);
    const columns = await db.$queryRaw<{ column_name: string }[]>`SELECT column_name FROM information_schema.columns WHERE table_name = 'users'`;
    expect(columns.map((c) => c.column_name).filter((c) => /lat|lng|long|coord|geo/.test(c))).toEqual([]);
  });

  it("resolves launch filters and single categories, and lists landing pages with real sellers", async () => {
    expect(await explore.resolveCategoryFilter("hair-beauty")).toMatchObject({ label: "Hair & Beauty" });
    expect(await explore.resolveCategoryFilter("jewellery")).toEqual({ key: "jewellery", label: "Jewellery", categories: ["jewellery"] });
    expect(await explore.resolveCategoryFilter("../etc")).toBeNull();
    const pages = await explore.landingPages();
    expect(pages).toEqual(expect.arrayContaining(["hair-beauty/soweto-gauteng", "barbers/cape-town-western-cape", "hair-beauty/pretoria-gauteng"]));
  });

  it("enquiries arriving from Explore (?src=reach) are credited to REACH", async () => {
    const { parseChannel } = await import("@/lib/lead-rules");
    const attribution = { ...parseChannel("reach"), campaignCode: null };
    expect(attribution.channel).toBe("REACH");
    const r = await pub.submitStorefrontLead(made.newsoweto.slug, null, { name: "Ayanda", contact: "+27725550111", message: null, consent: "on" }, attribution, `ip-ex-${tag}`);
    expect(r.ok).toBe(true);
    expect(await db.lead.findFirstOrThrow({ where: { sellerId: made.newsoweto.id } })).toMatchObject({ channel: "REACH", utmSource: "reach", source: "STOREFRONT" });
  });
});
