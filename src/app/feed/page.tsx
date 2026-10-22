import type { Metadata } from "next";
import Link from "next/link";
import { BuyerHeader } from "@/components/buyer-header";
import { followedSellerIds, getFollowingFeed, recentlyActiveSellers } from "@/lib/feed";
import { followingCount } from "@/lib/follows";
import { DISCOVERY_FILTERS, RECENTLY_ACTIVE_DAYS, decodeCursor, parseDiscoveryFilter } from "@/lib/feed-rules";
import { getCurrentSeller, requireSession } from "@/lib/session";
import { DiscoveryCard, FeedCard } from "./feed-parts";

export const metadata: Metadata = { title: "Your feed · REACH" };

export default async function FeedPage({ searchParams }: { searchParams: Promise<{ after?: string; cat?: string }> }) {
  const session = await requireSession();
  const sp = await searchParams;
  const cursor = decodeCursor(sp.after);
  const filter = parseDiscoveryFilter(sp.cat);
  const me = await getCurrentSeller();

  const [feed, followCount, active] = await Promise.all([
    getFollowingFeed(session.user.id, cursor),
    followingCount(session.user.id),
    recentlyActiveSellers({ categorySlugs: filter?.categories, excludeSellerId: me?.id }),
  ]);
  const followed = await followedSellerIds(
    session.user.id,
    active.map((s) => s.sellerId),
  );
  const returnPath = `/feed${filter ? `?cat=${filter.key}` : ""}`;
  const discoveryFirst = followCount === 0 || (feed.posts.length === 0 && !cursor);

  const discovery = (
    <section aria-labelledby="discover" className="space-y-3">
      <div>
        <h2 id="discover" className="text-lg font-semibold text-ink-900">
          Recently active sellers
        </h2>
        <p className="text-sm text-ink-500">Sellers who posted in the last {RECENTLY_ACTIVE_DAYS} days, most recent first.</p>
      </div>
      <nav aria-label="Categories" className="flex flex-wrap gap-2 text-sm">
        {[{ key: null, label: "All" }, ...DISCOVERY_FILTERS].map((f) => {
          const current = (filter?.key ?? null) === f.key;
          return (
            <Link
              key={f.label}
              href={f.key ? `/feed?cat=${f.key}#discover` : "/feed#discover"}
              aria-current={current ? "page" : undefined}
              className={`rounded-full px-3 py-1 font-medium ${current ? "bg-ink-900 text-white" : "bg-white text-ink-700 hover:bg-ink-300/40"}`}
            >
              {f.label}
            </Link>
          );
        })}
      </nav>
      {active.length === 0 ? (
        <p className="rounded-xl bg-white p-5 text-center text-sm text-ink-700">
          No sellers {filter ? `in ${filter.label} ` : ""}have posted in the last {RECENTLY_ACTIVE_DAYS} days yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {active.map((s) => (
            <DiscoveryCard key={s.slug} seller={s} following={followed.has(s.sellerId)} returnPath={returnPath} />
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="min-h-screen bg-ink-100">
      <BuyerHeader userId={session.user.id} current="feed" />
      <main className="mx-auto max-w-xl space-y-8 px-4 py-6">
        {discoveryFirst ? (
          <>
            <div className="rounded-2xl border border-brand-200 bg-brand-50 p-5">
              <h1 className="text-xl font-bold text-ink-900">{followCount === 0 ? "Welcome to your feed" : "Nothing new yet"}</h1>
              <p className="mt-1 text-ink-700">
                {followCount === 0
                  ? "Follow sellers to see their latest work here. Here are some who have posted recently."
                  : "The sellers you follow haven't posted yet. Their posts will appear here."}
              </p>
            </div>
            {discovery}
          </>
        ) : (
          <>
            <section aria-labelledby="following-feed" className="space-y-4">
              <h1 id="following-feed" className="sr-only">
                Posts from sellers you follow
              </h1>
              {cursor && (
                <Link href="/feed" className="text-sm font-semibold text-brand-700 hover:underline">
                  ← Back to the latest
                </Link>
              )}
              {feed.posts.map((p) => (
                <FeedCard key={p.code} post={p} />
              ))}
              {feed.posts.length === 0 && <p className="rounded-xl bg-white p-5 text-center text-ink-700">No more posts.</p>}
              {feed.nextCursor ? (
                <Link
                  href={`/feed?after=${feed.nextCursor}`}
                  className="block rounded-xl border border-ink-300 bg-white py-3 text-center font-semibold text-ink-700 hover:bg-ink-100"
                >
                  Older posts
                </Link>
              ) : (
                feed.posts.length > 0 && <p className="text-center text-sm text-ink-500">You&apos;re all caught up.</p>
              )}
            </section>
            {!cursor && discovery}
          </>
        )}
      </main>
    </div>
  );
}
