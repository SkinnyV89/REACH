import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { appUrl } from "@/lib/app-url";
import { exploreSellers, placeBySlug, resolveCategoryFilter } from "@/lib/explore";
import { exploreHref } from "@/lib/explore-rules";
import { ExploreView } from "../../explore-view";

// Search-engine landing pages, e.g. /explore/hair-beauty/soweto-gauteng
// ("braids Soweto"). Indexable only when there are real sellers nearby.

type Props = { params: Promise<{ cat: string; place: string }> };

const load = cache(async (catKey: string, placeSlug: string) => {
  const [filter, place] = await Promise.all([resolveCategoryFilter(catKey), placeBySlug(placeSlug)]);
  if (!filter || !place) return null;
  const { nearCount } = await exploreSellers({ place, categories: filter.categories, query: null });
  return { filter, place, nearCount };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { cat, place: placeSlug } = await params;
  const found = await load(cat, placeSlug);
  if (!found) return { title: "Explore · REACH", robots: { index: false } };
  const { filter, place, nearCount } = found;
  const title = `${filter.label} near ${place.name} | REACH`;
  const description =
    nearCount > 0
      ? `${nearCount} independent ${filter.label.toLowerCase()} ${nearCount === 1 ? "seller" : "sellers"} near ${place.name}. See their real work, prices and chat on WhatsApp.`
      : `Independent ${filter.label.toLowerCase()} sellers on REACH, starting near ${place.name}.`;
  return {
    title,
    description,
    alternates: { canonical: `${appUrl()}${exploreHref({ near: place.slug, cat: filter.key })}` },
    openGraph: { title, description, type: "website" },
    // A page with no sellers nearby is thin: keep it out of search results.
    robots: nearCount > 0 ? undefined : { index: false, follow: true },
  };
}

export default async function ExploreLandingPage({ params }: Props) {
  const { cat, place: placeSlug } = await params;
  const found = await load(cat, placeSlug);
  if (!found) notFound();
  const { filter, place } = found;
  return (
    <ExploreView
      place={place}
      filter={filter}
      query={null}
      tab="sellers"
      page={1}
      heading={`${filter.label} near ${place.name}`}
      path={exploreHref({ near: place.slug, cat: filter.key })}
    />
  );
}
