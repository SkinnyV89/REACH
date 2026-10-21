import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LeadForm, ViewTracker } from "@/components/public-widgets";
import { absoluteUrl, appUrl } from "@/lib/app-url";
import { findCampaignForStorefront, getStorefront, toPublicSeller } from "@/lib/public-storefronts";
import { getCurrentSeller } from "@/lib/session";
import { formatArea, parseCampaignCode } from "@/lib/storefront-rules";
import { submitStorefrontLeadAction } from "./actions";
import {
  Listings,
  OwnerBanner,
  PublicFooter,
  Section,
  StorefrontHeader,
  Unavailable,
  WhatsAppLink,
  carryQuery,
} from "./storefront-parts";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ src?: string | string[]; c?: string | string[] }>;
};

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const storefront = await getStorefront(slug);
  // Unpublished or missing storefronts are never indexed.
  if (!storefront || storefront.state !== "live") return { title: "Storefront · REACH", robots: { index: false, follow: false } };
  const seller = toPublicSeller(storefront.seller);
  const area = formatArea(seller);
  const description = seller.tagline ?? seller.description?.slice(0, 160) ?? `${seller.businessName} on REACH`;
  const image = seller.cover ?? seller.logo;
  return {
    title: `${seller.businessName}${area ? ` · ${area}` : ""} | REACH`,
    description,
    // Indexable: buyers find sellers through search. The WhatsApp number is
    // not in the page; it's behind /go/wa.
    alternates: { canonical: `${appUrl()}/s/${seller.slug}` },
    openGraph: {
      title: seller.businessName,
      description,
      type: "website",
      url: `${appUrl()}/s/${seller.slug}`,
      // Link previews show the cover photo, or the logo.
      ...(image ? { images: [{ url: absoluteUrl(image.url), width: image.width, height: image.height }] } : {}),
    },
  };
}

export default async function StorefrontPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const src = first(sp.src);
  const code = parseCampaignCode(sp.c);

  const storefront = await getStorefront(slug);
  if (!storefront) notFound();
  const viewer = await getCurrentSeller();
  const isOwner = viewer?.id === storefront.seller.id;
  const live = storefront.state === "live";
  if (!live && !isOwner) return <Unavailable />;

  const seller = toPublicSeller(storefront.seller);
  const campaign = await findCampaignForStorefront(storefront.seller.id, code);
  const query = carryQuery(src, campaign ? code : null);
  const trackable = live && !isOwner;

  return (
    <div className="min-h-screen bg-ink-100">
      {trackable && <ViewTracker payload={{ storefront: seller.slug, item: null, type: "VIEW", src, c: campaign ? code : null }} />}
      {isOwner && <OwnerBanner live={live} manageHref="/storefront" />}

      <main className="mx-auto max-w-2xl px-4 pb-10 pt-6">
        {campaign && (
          <section aria-label="Featured" className="mb-4 overflow-hidden rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5">
            <p className="text-2xl font-bold leading-tight text-ink-900">{campaign.headline}</p>
            <p className="mt-2 whitespace-pre-line text-ink-700">{campaign.body}</p>
          </section>
        )}

        <StorefrontHeader seller={seller} />

        {seller.hasWhatsapp && (
          <div className="mt-4">
            <WhatsAppLink
              href={`/go/wa/${seller.slug}${carryQuery(src, campaign ? code : null)}`}
              label={campaign?.callToAction ?? "Chat on WhatsApp"}
            />
          </div>
        )}

        {seller.description && (
          <Section id="about" title="About">
            <p className="whitespace-pre-line rounded-xl bg-white p-4 text-ink-700">{seller.description}</p>
          </Section>
        )}

        <Section
          id="listings"
          title={seller.layout === "MENU" ? "Menu" : seller.layout === "PORTFOLIO" ? "Services" : "Products"}
        >
          <Listings seller={seller} items={storefront.items} query={query} />
        </Section>

        <Section id="enquire" title={`Ask ${seller.businessName} a question`}>
          <div className="rounded-2xl border border-ink-300/60 bg-white p-5">
            <LeadForm
              action={submitStorefrontLeadAction.bind(null, seller.slug, null, src, campaign ? code : null)}
              businessName={seller.businessName}
              disabled={!live}
              disabledText="Enquiries open once this storefront is published."
            />
          </div>
        </Section>

        {seller.links.length > 0 && (
          <Section id="links" title="Find them online">
            <ul className="flex flex-wrap gap-2">
              {seller.links.map(([label, url]) => (
                <li key={label}>
                  <a href={url} rel="nofollow noopener noreferrer" target="_blank" className="inline-block rounded-full bg-white px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-300/40">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <p className="mt-6 text-center text-xs text-ink-500">Details on this page are provided by {seller.businessName}.</p>
        <PublicFooter />
      </main>
    </div>
  );
}
