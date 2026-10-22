import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublicTopBar } from "@/components/public-top-bar";
import { appUrl } from "@/lib/app-url";
import { POSTS_PER_PAGE } from "@/lib/post-rules";
import { getStorefront, listPublicPosts, toPublicSeller } from "@/lib/public-storefronts";
import { getCurrentSeller } from "@/lib/session";
import { parseCampaignCode } from "@/lib/storefront-rules";
import { OwnerBanner, PostGrid, PublicFooter, Unavailable, carryQuery } from "../storefront-parts";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string; src?: string | string[]; c?: string | string[] }>;
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const pageNumber = (v: string | undefined) => Math.min(1000, Math.max(1, Number.parseInt(v ?? "1", 10) || 1));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const storefront = await getStorefront(slug);
  if (!storefront || storefront.state !== "live") return { title: "Posts · REACH", robots: { index: false, follow: false } };
  return {
    title: `Posts · ${storefront.seller.businessName} | REACH`,
    alternates: { canonical: `${appUrl()}/s/${storefront.seller.slug}/posts` },
  };
}

export default async function AllPostsPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const page = pageNumber(sp.page);
  const storefront = await getStorefront(slug);
  if (!storefront) notFound();
  const viewer = await getCurrentSeller();
  const isOwner = viewer?.id === storefront.seller.id;
  const live = storefront.state === "live";
  if (!live && !isOwner) return <Unavailable />;

  const seller = toPublicSeller(storefront.seller);
  const src = first(sp.src);
  const code = parseCampaignCode(sp.c);
  const query = carryQuery(src, code);
  const { posts, total } = await listPublicPosts(storefront.seller.id, { take: POSTS_PER_PAGE, skip: (page - 1) * POSTS_PER_PAGE });
  const pages = Math.max(1, Math.ceil(total / POSTS_PER_PAGE));
  const pageHref = (n: number) => `/s/${seller.slug}/posts${carryQuery(src, code, n > 1 ? { page: String(n) } : {})}`;

  return (
    <div className="min-h-screen bg-ink-100">
      <PublicTopBar next={`/s/${seller.slug}/posts`} />
      {isOwner && <OwnerBanner live={live} manageHref="/posts" />}
      <main className="mx-auto max-w-2xl px-4 pb-10 pt-6">
        <Link href={`/s/${seller.slug}${query}`} className="text-sm font-semibold text-brand-700 hover:underline">
          ← {seller.businessName}
        </Link>
        <h1 className="mt-3 text-2xl font-bold text-ink-900">Posts</h1>
        <p className="mt-1 text-sm text-ink-500">
          {total} {total === 1 ? "post" : "posts"} by {seller.businessName}
        </p>
        <div className="mt-4">
          {posts.length === 0 ? (
            <p className="rounded-xl bg-white p-5 text-center text-ink-700">No posts here.</p>
          ) : (
            <PostGrid sellerSlug={seller.slug} posts={posts} query={query} />
          )}
        </div>
        {pages > 1 && (
          <nav aria-label="Pages" className="mt-4 flex items-center justify-between text-sm">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className="font-semibold text-brand-700 hover:underline">
                ← Newer
              </Link>
            ) : (
              <span />
            )}
            <span className="text-ink-500">
              Page {page} of {pages}
            </span>
            {page < pages ? (
              <Link href={pageHref(page + 1)} className="font-semibold text-brand-700 hover:underline">
                Older →
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}
        <PublicFooter />
      </main>
    </div>
  );
}
