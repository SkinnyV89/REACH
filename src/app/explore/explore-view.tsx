import Link from "next/link";
import { PublicTopBar } from "@/components/public-top-bar";
import { exploreCategoryOptions, exploreLatestWork, exploreSellers, type CategoryFilter, type ExplorePlace } from "@/lib/explore";
import { MIN_NEAR_RESULTS, NEAR_RADIUS_KM, PAID_PLACEMENT_PROMISE, RANKING_NOTE, exploreHref } from "@/lib/explore-rules";
import { followedSellerIds } from "@/lib/feed";
import { getCurrentSeller, getSession } from "@/lib/session";
import { listPlaces } from "@/lib/storefronts";
import { PublicFooter } from "../s/[slug]/storefront-parts";
import { SellerCard, WorkGrid } from "./explore-parts";
import { NearPicker } from "./near-picker";

const CHIPS_SHOWN = 3; // the launch categories; the rest sit under "More"

export async function ExploreView({
  place,
  filter,
  query,
  tab,
  page,
  heading,
  path,
}: {
  place: ExplorePlace | null;
  filter: CategoryFilter | null;
  query: string | null;
  tab: "sellers" | "work";
  page: number;
  heading: string;
  path: string; // this page's own URL, to come back to after signing in
}) {
  const [session, me, towns, options] = await Promise.all([getSession(), getCurrentSeller(), listPlaces(), exploreCategoryOptions()]);
  const base = { near: place?.slug ?? null, cat: filter?.key ?? null, q: query, tab };
  const categories = filter?.categories ?? null;

  const sellers = tab === "sellers" ? await exploreSellers({ place, categories, query, page }) : null;
  const work = tab === "work" ? await exploreLatestWork({ place, categories, page }) : null;
  const followed =
    session && sellers ? await followedSellerIds(session.user.id, sellers.cards.map((c) => c.sellerId)) : new Set<string>();
  const ownSellerId = me?.status === "ACTIVE" ? me.id : null;

  const moreSelected = filter && !options.slice(0, CHIPS_SHOWN).some((o) => o.key === filter.key);
  const pages = sellers?.pages ?? work?.pages ?? 1;
  const current = sellers?.page ?? work?.page ?? 1;

  return (
    <div className="min-h-screen bg-ink-100">
      <PublicTopBar next={path} />
      <main className="mx-auto max-w-2xl space-y-5 px-4 pb-10 pt-6">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">{heading}</h1>
          <p className="mt-1 text-sm text-ink-700">Find independent sellers near you and see their real work.</p>
        </div>

        <section aria-label="Filters" className="space-y-3 rounded-2xl border border-ink-300/60 bg-white p-4">
          <NearPicker towns={towns} current={place?.slug ?? null} params={{ cat: base.cat, q: query, tab }} />
          <form action="/explore" method="get" role="search" className="flex gap-2">
            {place && <input type="hidden" name="near" value={place.slug} />}
            {filter && <input type="hidden" name="cat" value={filter.key} />}
            {tab === "work" && <input type="hidden" name="tab" value="work" />}
            <label htmlFor="q" className="sr-only">
              Search sellers and items
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={query ?? ""}
              maxLength={60}
              placeholder="Search, e.g. knotless braids, fade, red velvet"
              className="min-w-0 flex-1 rounded-lg border border-ink-300 px-3 py-2 text-base"
            />
            <button type="submit" className="rounded-lg bg-brand-600 px-4 py-2 font-semibold text-white hover:bg-brand-700">
              Search
            </button>
          </form>
          <nav aria-label="Categories" className="flex flex-wrap items-center gap-2 text-sm">
            {[{ key: null as string | null, label: "All" }, ...options.slice(0, CHIPS_SHOWN)].map((o) => {
              const selected = (filter?.key ?? null) === o.key;
              return (
                <Link
                  key={o.label}
                  href={exploreHref({ ...base, cat: o.key })}
                  aria-current={selected ? "page" : undefined}
                  className={`rounded-full px-3 py-1 font-medium ${selected ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-700 hover:bg-ink-300/40"}`}
                >
                  {o.label}
                </Link>
              );
            })}
            <details className="relative">
              <summary className={`cursor-pointer list-none rounded-full px-3 py-1 font-medium ${moreSelected ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-700"}`}>
                {moreSelected ? filter.label : "More"} ▾
              </summary>
              <ul className="absolute left-0 z-10 mt-1 max-h-72 w-64 overflow-auto rounded-xl border border-ink-300/60 bg-white py-1 shadow-lg">
                {options.slice(CHIPS_SHOWN).map((o) => (
                  <li key={o.key}>
                    <Link href={exploreHref({ ...base, cat: o.key })} className="block px-3 py-1.5 text-ink-700 hover:bg-ink-100">
                      {o.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          </nav>
        </section>

        <nav aria-label="View" className="flex gap-4 border-b border-ink-300/60 text-sm font-medium">
          {(
            [
              ["sellers", "Sellers"],
              ["work", "Latest work"],
            ] as const
          ).map(([key, label]) => (
            <Link
              key={key}
              href={exploreHref({ ...base, tab: key })}
              aria-current={tab === key ? "page" : undefined}
              className={`-mb-px border-b-2 py-2 ${tab === key ? "border-brand-600 text-brand-700" : "border-transparent text-ink-500 hover:text-ink-900"}`}
            >
              {label}
            </Link>
          ))}
        </nav>

        {sellers && (
          <section aria-label="Sellers" className="space-y-3">
            {query && (
              <p className="text-sm text-ink-700">
                {sellers.total === 0 ? "No sellers match" : `${sellers.total} ${sellers.total === 1 ? "seller matches" : "sellers match"}`} &ldquo;{query}&rdquo;
                {filter ? ` in ${filter.label}` : ""}.
              </p>
            )}
            {sellers.total === 0 ? (
              <p className="rounded-xl bg-white p-5 text-center text-ink-700">
                {query ? "Try a different word, or remove the category filter." : `No sellers${filter ? ` in ${filter.label}` : ""} on REACH yet.`}
              </p>
            ) : (
              <>
                {place && current === 1 && sellers.nearCount < MIN_NEAR_RESULTS && (
                  <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    {sellers.nearCount === 0
                      ? `No sellers within about ${NEAR_RADIUS_KM} km of ${place.name} yet, so these are further away.`
                      : `Only ${sellers.nearCount} ${sellers.nearCount === 1 ? "seller is" : "sellers are"} within about ${NEAR_RADIUS_KM} km of ${place.name} so far; more further away below.`}
                  </p>
                )}
                <ul className="space-y-3">
                  {sellers.cards.map((card, i) => {
                    const prev = sellers.cards[i - 1];
                    const heading =
                      card.group === "near" && (!prev || prev.group !== "near")
                        ? `Near ${place!.name}`
                        : card.group === "further" && (!prev || prev.group !== "further")
                          ? "Further away"
                          : null;
                    return (
                      <SectionedCard key={card.slug} heading={heading}>
                        <SellerCard
                          card={card}
                          following={followed.has(card.sellerId)}
                          signedIn={Boolean(session)}
                          own={card.sellerId === ownSellerId}
                          returnPath={path}
                        />
                      </SectionedCard>
                    );
                  })}
                </ul>
              </>
            )}
          </section>
        )}

        {work && (
          <section aria-label="Latest work" className="space-y-3">
            {work.total === 0 ? (
              <p className="rounded-xl bg-white p-5 text-center text-ink-700">No posts in the last 60 days{filter ? ` in ${filter.label}` : ""} yet.</p>
            ) : (
              <WorkGrid tiles={work.tiles} />
            )}
          </section>
        )}

        {pages > 1 && (
          <nav aria-label="Pages" className="flex items-center justify-between text-sm">
            {current > 1 ? (
              <Link href={exploreHref({ ...base, page: current - 1 })} className="font-semibold text-brand-700 hover:underline">
                ← Previous
              </Link>
            ) : (
              <span />
            )}
            <span className="text-ink-500">
              Page {current} of {pages}
            </span>
            {current < pages ? (
              <Link href={exploreHref({ ...base, page: current + 1 })} className="font-semibold text-brand-700 hover:underline">
                Next →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}

        <section aria-label="How Explore is sorted" className="rounded-xl bg-white px-4 py-3 text-xs text-ink-700">
          <p>{RANKING_NOTE}</p>
          <p className="mt-1 font-semibold text-ink-900">{PAID_PLACEMENT_PROMISE}</p>
          <p className="mt-1 text-ink-500">Distances are measured between town centres, so they&apos;re approximate.</p>
        </section>
        <PublicFooter />
      </main>
    </div>
  );
}

// A card, with a "Near Soweto" / "Further away" heading above the first of each group.
function SectionedCard({ heading, children }: { heading: string | null; children: React.ReactNode }) {
  if (!heading) return children;
  return (
    <>
      <li className="pt-2 first:pt-0">
        <h2 className="text-base font-semibold text-ink-900">{heading}</h2>
      </li>
      {children}
    </>
  );
}
