import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CaptureExplainer, CaptureLabel } from "@/components/capture-label";
import { Photo } from "@/components/photo";
import { LeadForm, ViewTracker } from "@/components/public-widgets";
import { absoluteUrl, appUrl } from "@/lib/app-url";
import { formatPostedDate } from "@/lib/post-rules";
import { formatPrice } from "@/lib/product-rules";
import { findCampaignForStorefront, getStorefrontPost, toPublicSeller } from "@/lib/public-storefronts";
import { getCurrentSeller } from "@/lib/session";
import { formatArea, parseCampaignCode } from "@/lib/storefront-rules";
import { submitStorefrontLeadAction } from "../../actions";
import { AvailabilityBadge, PublicFooter, Unavailable, WhatsAppLink, carryQuery } from "../../storefront-parts";

type Props = {
  params: Promise<{ slug: string; code: string }>;
  searchParams: Promise<{ src?: string | string[]; c?: string | string[] }>;
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, code } = await params;
  const found = await getStorefrontPost(slug, code);
  if (!found || found.state !== "live") return { title: "REACH", robots: { index: false, follow: false } };
  const { seller, post } = found;
  const description = post.caption ? post.caption.slice(0, 160) : `A post by ${seller.businessName} on REACH.`;
  const image = post.photos[0];
  return {
    title: `${seller.businessName}: ${post.caption ? post.caption.slice(0, 60) : "post"} | REACH`,
    description,
    alternates: { canonical: `${appUrl()}/s/${seller.slug}/posts/${post.code}` },
    openGraph: {
      title: `${seller.businessName} on REACH`,
      description,
      type: "article",
      images: [{ url: absoluteUrl(image.url), width: image.width, height: image.height }],
    },
  };
}

export default async function PublicPostPage({ params, searchParams }: Props) {
  const { slug, code } = await params;
  const sp = await searchParams;
  const src = first(sp.src);
  const campaignParam = parseCampaignCode(sp.c);

  const found = await getStorefrontPost(slug, code);
  if (!found) notFound();
  const viewer = await getCurrentSeller();
  const isOwner = viewer?.id === found.seller.id;
  const live = found.state === "live";
  if (!live && !isOwner) return <Unavailable />;

  const seller = toPublicSeller(found.seller);
  const { post } = found;
  const campaign = await findCampaignForStorefront(found.seller.id, campaignParam);
  const campaignCode = campaign ? campaignParam : null;
  const area = formatArea(seller);
  const query = carryQuery(src, campaignCode);

  return (
    <div className="min-h-screen bg-ink-100">
      {live && !isOwner && (
        <ViewTracker payload={{ storefront: seller.slug, item: null, post: post.code, type: "VIEW", src, c: campaignCode }} />
      )}
      {isOwner && (
        <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
          {live ? "You're viewing your own post. Your visits aren't counted." : "Preview: customers can't see this post right now."}{" "}
          <Link href="/posts" className="font-semibold underline">
            Manage posts
          </Link>
        </div>
      )}

      <main className="mx-auto max-w-2xl px-4 pb-10 pt-6">
        <Link href={`/s/${seller.slug}${query}`} className="text-sm font-semibold text-brand-700 hover:underline">
          ← {seller.businessName}
        </Link>

        <article className="mt-3 overflow-hidden rounded-2xl border border-ink-300/60 bg-white shadow-sm">
          <ul aria-label="Photos" className="flex snap-x snap-mandatory overflow-x-auto bg-ink-100 [scrollbar-width:thin]">
            {post.photos.map((p, i) => (
              <li key={p.url} className="relative w-full shrink-0 snap-center">
                <Photo
                  photo={p}
                  alt={post.photos.length > 1 ? `Photo ${i + 1} of ${post.photos.length} by ${seller.businessName}` : `Photo by ${seller.businessName}`}
                  sizes="(min-width: 672px) 672px, 100vw"
                  priority={i === 0}
                  className="aspect-square w-full object-contain"
                />
                <CaptureLabel source={p.captureSource} capturedAt={p.capturedAt} className="absolute bottom-3 left-3" />
              </li>
            ))}
          </ul>
          <div className="space-y-3 p-5">
            {post.photos.length > 1 && <p className="text-xs text-ink-500">{post.photos.length} photos · swipe or scroll sideways for more</p>}
            <p className="text-sm text-ink-500">
              <span className="font-semibold text-ink-900">{seller.businessName}</span>
              {area ? ` · ${area}` : ""} · {formatPostedDate(post.postedAt)}
            </p>
            {post.caption && <p className="whitespace-pre-line text-ink-900">{post.caption}</p>}
            <CaptureExplainer sources={post.photos.map((p) => p.captureSource)} />

            {post.products.length > 0 && (
              <section aria-labelledby="tagged">
                <h2 id="tagged" className="text-sm font-semibold text-ink-900">
                  In this post
                </h2>
                <ul className="mt-2 space-y-2">
                  {post.products.map((item) => (
                    <li key={item.slug}>
                      <Link
                        href={`/s/${seller.slug}/${item.slug}${query}`}
                        className="flex items-center gap-3 rounded-xl border border-ink-300/60 p-2 hover:border-brand-500"
                      >
                        {item.photos[0] ? (
                          <Photo photo={item.photos[0]} alt="" sizes="48px" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                        ) : (
                          <span aria-hidden className="h-12 w-12 shrink-0 rounded-lg bg-ink-100" />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-ink-900">{item.name}</span>
                          <span className="text-sm text-ink-700">{formatPrice(item.priceType, item.price)}</span>
                        </span>
                        <AvailabilityBadge item={item} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {seller.hasWhatsapp && (
              <div className="pt-2">
                <WhatsAppLink href={`/go/wa/${seller.slug}${carryQuery(src, campaignCode, { post: post.code })}`} label="Ask about this on WhatsApp" />
              </div>
            )}
          </div>
        </article>

        <section aria-labelledby="enquire" className="mt-6 rounded-2xl border border-ink-300/60 bg-white p-5">
          <h2 id="enquire" className="text-lg font-semibold text-ink-900">
            Ask {seller.businessName} about this
          </h2>
          <p className="mt-1 text-sm text-ink-500">{seller.businessName} will get your message with this post attached.</p>
          <div className="mt-4">
            <LeadForm
              action={submitStorefrontLeadAction.bind(null, seller.slug, null, src, campaignCode, post.code)}
              businessName={seller.businessName}
              disabled={!live}
              disabledText="Enquiries open once this post is public."
            />
          </div>
        </section>

        <p className="mt-6 text-center text-xs text-ink-500">Posts are provided by {seller.businessName}.</p>
        <PublicFooter />
      </main>
    </div>
  );
}
