import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/app-url";
import { db } from "@/lib/db";
import { landingPages } from "@/lib/explore";

// Public pages for search engines: Explore, its category-and-town landing
// pages (only where real sellers are), and every live storefront. Posts and
// items are reached from their storefronts.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appUrl();
  const [pages, storefronts] = await Promise.all([
    landingPages(),
    db.seller.findMany({
      where: { status: "ACTIVE", storefrontPublishedAt: { not: null } },
      select: { slug: true, updatedAt: true },
      orderBy: { storefrontPublishedAt: "desc" },
      take: 45_000, // under the 50,000-URL sitemap limit, with room for landing pages
    }),
  ]);
  return [
    { url: `${base}/explore`, changeFrequency: "daily", priority: 0.9 },
    ...pages.map((p) => ({ url: `${base}/explore/${p}`, changeFrequency: "daily" as const, priority: 0.8 })),
    ...storefronts.map((s) => ({ url: `${base}/s/${s.slug}`, lastModified: s.updatedAt, changeFrequency: "weekly" as const, priority: 0.6 })),
  ];
}
