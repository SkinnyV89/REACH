import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { LeadForm, ViewTracker } from "@/components/public-widgets";
import { absoluteUrl, appUrl } from "@/lib/app-url";
import { formatPrice } from "@/lib/product-rules";
import { findCampaignForStorefront, getStorefrontItem, toPublicSeller } from "@/lib/public-storefronts";
import { getCurrentSeller } from "@/lib/session";
import { formatArea, parseCampaignCode } from "@/lib/storefront-rules";
import { submitStorefrontLeadAction } from "../actions";
import {
  AvailabilityBadge,
  AvailabilityNote,
  Gallery,
  OwnerBanner,
  PublicFooter,
  Unavailable,
  WhatsAppLink,
  carryQuery,
} from "../storefront-parts";

type Props = {
  params: Promise<{ slug: string; item: string }>;
  searchParams: Promise<{ src?: string | string[]; c?: string | string[] }>;
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, item } = await params;
  const found = await getStorefrontItem(slug, item);
  if (!found || found.kind !== "item" || found.state !== "live") {
    return { title: "REACH", robots: { index: false, follow: false } };
  }
  const price = formatPrice(found.item.priceType, found.item.price);
  const description = found.item.description?.slice(0, 160) ?? `${found.item.name} from ${found.seller.businessName}, ${price}.`;
  // Link previews (WhatsApp, Facebook) show the main photo, or the cover.
  const image = found.item.photos[0] ?? found.seller.cover;
  return {
    title: `${found.item.name} · ${found.seller.businessName} | REACH`,
    description,
    alternates: { canonical: `${appUrl()}/s/${found.seller.slug}/${found.item.slug}` },
    openGraph: {
      title: `${found.item.name} · ${price}`,
      description,
      type: "website",
      ...(image ? { images: [{ url: absoluteUrl(image.url), width: image.width, height: image.height }] } : {}),
    },
  };
}

export default async function ItemPage({ params, searchParams }: Props) {
  const { slug, item: itemSlug } = await params;
  const sp = await searchParams;
  const src = first(sp.src);
  const code = parseCampaignCode(sp.c);

  const found = await getStorefrontItem(slug, itemSlug);
  if (!found) notFound();
  // Renamed item: the old address keeps working, permanently pointing to the new one.
  if (found.kind === "redirect") permanentRedirect(`${found.to}${carryQuery(src, code)}`);

  const viewer = await getCurrentSeller();
  const isOwner = viewer?.id === found.seller.id;
  const live = found.state === "live";
  if (!live && !isOwner) return <Unavailable />;

  const seller = toPublicSeller(found.seller);
  const item = found.item;
  const campaign = await findCampaignForStorefront(found.seller.id, code);
  const campaignCode = campaign ? code : null;
  const area = formatArea(seller);
  const trackable = live && !isOwner;

  return (
    <div className="min-h-screen bg-ink-100">
      {trackable && <ViewTracker payload={{ storefront: seller.slug, item: item.slug, type: "VIEW", src, c: campaignCode }} />}
      {isOwner && <OwnerBanner live={live} manageHref={`/products`} />}

      <main className="mx-auto max-w-2xl px-4 pb-10 pt-6">
        <Link href={`/s/${seller.slug}${carryQuery(src, campaignCode)}`} className="text-sm font-semibold text-brand-700 hover:underline">
          ← {seller.businessName}
        </Link>

        <article className="mt-3 overflow-hidden rounded-2xl border border-ink-300/60 bg-white p-5 shadow-sm">
          <Gallery photos={item.photos} itemName={item.name} />
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
            {item.kind === "SERVICE" ? "Service" : "Product"} · {item.category.name}
          </p>
          <h1 className="mt-1 text-2xl font-bold leading-tight text-ink-900">{item.name}</h1>
          <p className="mt-2 text-2xl font-bold text-ink-900">{formatPrice(item.priceType, item.price)}</p>
          <p className="mt-2 flex flex-wrap items-center gap-2">
            <AvailabilityBadge item={item} />
            <AvailabilityNote item={item} />
          </p>
          {item.description && <p className="mt-4 whitespace-pre-line text-ink-700">{item.description}</p>}
          <p className="mt-4 text-sm text-ink-500">
            From {seller.businessName}
            {area ? `, ${area}` : ""}
          </p>
          {seller.hasWhatsapp && (
            <div className="mt-5">
              <WhatsAppLink
                href={`/go/wa/${seller.slug}${carryQuery(src, campaignCode, { item: item.slug })}`}
                label={`Ask about this on WhatsApp`}
              />
            </div>
          )}
        </article>

        <section aria-labelledby="enquire" className="mt-6 rounded-2xl border border-ink-300/60 bg-white p-5">
          <h2 id="enquire" className="text-lg font-semibold text-ink-900">
            Ask about {item.name}
          </h2>
          <p className="mt-1 text-sm text-ink-500">{seller.businessName} will get your message with this item attached.</p>
          <div className="mt-4">
            <LeadForm
              action={submitStorefrontLeadAction.bind(null, seller.slug, item.slug, src, campaignCode)}
              businessName={seller.businessName}
              disabled={!live}
              disabledText="Enquiries open once this storefront is published."
            />
          </div>
        </section>

        <p className="mt-6 text-center text-xs text-ink-500">Details on this page are provided by {seller.businessName}.</p>
        <PublicFooter />
      </main>
    </div>
  );
}
