import type { Metadata } from "next";
import { appUrl } from "@/lib/app-url";
import { resolveCategoryFilter } from "@/lib/explore";
import { exploreHref, normaliseQuery, parsePage } from "@/lib/explore-rules";
import { ExploreView } from "./explore-view";
import { resolveNear } from "./near";

type Props = { searchParams: Promise<{ near?: string; cat?: string; q?: string; tab?: string; open?: string; page?: string }> };

async function resolve(sp: Awaited<Props["searchParams"]>) {
  const [{ place }, filter] = await Promise.all([resolveNear(sp.near), resolveCategoryFilter(sp.cat)]);
  return {
    place,
    filter,
    query: normaliseQuery(sp.q),
    tab: sp.tab === "work" ? ("work" as const) : ("sellers" as const),
    openNow: sp.open === "1",
    page: parsePage(sp.page),
  };
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const hasParams = Object.values(sp).some((v) => v !== undefined && v !== "");
  const urlPlace = sp.near ? (await resolve(sp)).place : null;
  const filter = await resolveCategoryFilter(sp.cat);
  // A town + category has its own indexable page; searches and other
  // combinations aren't indexed.
  const landing = urlPlace && filter && !sp.q && sp.tab !== "work" && parsePage(sp.page) === 1 ? exploreHref({ near: urlPlace.slug, cat: filter.key }) : null;
  return {
    title: "Explore sellers · REACH",
    description: "Find independent sellers near you in South Africa: hair and beauty, barbers, food and more. See their real work and chat on WhatsApp.",
    alternates: { canonical: `${appUrl()}${landing ?? "/explore"}` },
    robots: hasParams ? { index: false, follow: true } : undefined,
  };
}

export default async function ExplorePage({ searchParams }: Props) {
  const sp = await searchParams;
  const { place, filter, query, tab, openNow, page } = await resolve(sp);
  const heading = filter ? `${filter.label}${place ? ` near ${place.name}` : ""}` : place ? `Sellers near ${place.name}` : "Explore sellers";
  return (
    <ExploreView
      place={place}
      filter={filter}
      query={query}
      tab={tab}
      openNow={openNow}
      page={page}
      heading={heading}
      path={exploreHref({ near: sp.near ? place?.slug : null, cat: filter?.key, q: query, tab, open: openNow, page })}
    />
  );
}
