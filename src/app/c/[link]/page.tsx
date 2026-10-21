import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatPrice } from "@/lib/product-rules";
import { formatWhatsappNumber, provinceLabel } from "@/lib/seller-profile";
import { whatsappGreeting, whatsappLink } from "@/lib/lead-rules";
import { getPublicCampaign, toPublicView } from "@/lib/public-campaigns";
import { getCurrentSeller } from "@/lib/session";
import { submitLeadAction } from "./actions";
import { LeadForm, ViewTracker, WhatsAppButton } from "@/components/public-widgets";

// Campaign pages are shared by link, not found by search: keep sellers'
// WhatsApp numbers out of search indexes.
const robots = { index: false, follow: false, nocache: true };

type Props = {
  params: Promise<{ link: string }>;
  searchParams: Promise<{ src?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const campaign = await getPublicCampaign((await params).link);
  if (!campaign || campaign.state !== "live") return { title: "Campaign · REACH", robots };
  return {
    title: `${campaign.seller.businessName} · REACH`,
    description: campaign.headline,
    robots,
    openGraph: { title: campaign.headline, description: campaign.body.slice(0, 160) },
  };
}

export default async function PublicCampaignPage({ params, searchParams }: Props) {
  const { link } = await params;
  const rawSrc = (await searchParams).src;
  const src = Array.isArray(rawSrc) ? (rawSrc[0] ?? null) : (rawSrc ?? null);
  const campaign = await getPublicCampaign(link);
  if (!campaign) notFound();

  // The owner may preview an unpublished campaign; everyone else may not.
  const viewer = await getCurrentSeller();
  const isOwner = viewer?.id === campaign.sellerId;
  if (campaign.state !== "live" && !isOwner) return <Unavailable />;

  const view = toPublicView(campaign);
  const live = campaign.state === "live";
  const place = [view.location, provinceLabel(campaign.seller.province)].filter(Boolean).join(", ");
  const waHref = view.whatsappNumber ? whatsappLink(view.whatsappNumber, whatsappGreeting(view.businessName)) : null;
  // Owners previewing their own page shouldn't inflate their numbers.
  const trackable = live && !isOwner;

  return (
    <div className="min-h-screen bg-ink-100">
      {trackable && <ViewTracker payload={{ link, type: "VIEW", src }} />}
      {isOwner && (
        <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
          {live
            ? "You're viewing your own campaign. Your visits aren't counted."
            : "Preview: this campaign isn't published, so customers can't open it yet."}{" "}
          <Link href={`/campaigns/${campaign.id}`} className="font-semibold underline">
            Manage campaign
          </Link>
        </div>
      )}

      <main className="mx-auto max-w-lg px-4 pb-10 pt-6">
        <header className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xl font-bold text-white"
          >
            {view.businessName.trim().charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-ink-900">{view.businessName}</p>
            {place && <p className="truncate text-sm text-ink-500">{place}</p>}
          </div>
        </header>

        <article className="mt-5 overflow-hidden rounded-2xl border border-ink-300/60 bg-white shadow-sm">
          <div className="bg-gradient-to-br from-brand-50 to-white px-5 py-7">
            <h1 className="text-2xl font-bold leading-tight text-ink-900">{view.headline}</h1>
            <p className="mt-3 whitespace-pre-line text-base text-ink-700">{view.body}</p>
          </div>

          {view.product && (
            <div className="border-t border-ink-100 px-5 py-4">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
                {view.product.kind === "SERVICE" ? "Service" : "Product"}
              </p>
              <div className="mt-1 flex items-baseline justify-between gap-4">
                <p className="font-semibold text-ink-900">{view.product.name}</p>
                <p className="shrink-0 text-lg font-bold text-ink-900">
                  {formatPrice(view.product.priceType, view.product.price)}
                </p>
              </div>
              {!view.product.available && (
                <p className="mt-1 text-sm text-amber-800">
                  {view.product.kind === "SERVICE" ? "Not taking bookings right now." : "Out of stock for now."}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2 border-t border-ink-100 px-5 py-5">
            {waHref ? (
              <>
                <WhatsAppButton href={waHref} link={link} src={src} label={view.callToAction} trackable={trackable} />
                <p className="text-center text-sm text-ink-500">
                  WhatsApp {formatWhatsappNumber(view.whatsappNumber)}
                </p>
              </>
            ) : (
              <p className="text-center text-sm text-ink-500">Send an enquiry below.</p>
            )}
          </div>
        </article>

        <section aria-labelledby="enquire" className="mt-6 rounded-2xl border border-ink-300/60 bg-white p-5 shadow-sm">
          <h2 id="enquire" className="text-lg font-semibold text-ink-900">
            Prefer {view.businessName} to contact you?
          </h2>
          <p className="mt-1 text-sm text-ink-500">Leave your details and they&apos;ll get back to you.</p>
          <div className="mt-4">
            <LeadForm
              action={submitLeadAction.bind(null, link, src)}
              businessName={view.businessName}
              disabled={!live}
            />
          </div>
        </section>

        <p className="mt-6 text-center text-xs text-ink-500">
          Details on this page are provided by {view.businessName}.
        </p>
        <PublicFooter />
      </main>
    </div>
  );
}

function PublicFooter() {
  return (
    <footer className="mt-4 text-center text-xs text-ink-500">
      Powered by{" "}
      <Link href="/" className="font-semibold text-brand-700">
        REACH
      </Link>{" "}
      ·{" "}
      <Link href="/privacy" className="underline">
        Privacy
      </Link>
    </footer>
  );
}

function Unavailable() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-ink-100 px-4 text-center">
      <h1 className="text-xl font-semibold text-ink-900">This campaign isn&apos;t available right now.</h1>
      <p className="mt-2 max-w-sm text-ink-700">The seller may have paused it. Please check back later.</p>
      <PublicFooter />
    </main>
  );
}
