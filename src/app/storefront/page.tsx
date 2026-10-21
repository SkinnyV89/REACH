import type { Metadata } from "next";
import Link from "next/link";
import { CopyLink } from "@/app/campaigns/[id]/share-panel";
import { SellerHeader } from "@/components/seller-header";
import { appUrl } from "@/lib/app-url";
import { CHANNELS, SHARE_CHANNELS } from "@/lib/lead-rules";
import { getSellerImages } from "@/lib/media";
import { requireSeller } from "@/lib/session";
import { formatArea } from "@/lib/storefront-rules";
import { isStorageConfigured } from "@/lib/storage";
import { getStorefrontEditor, listPlaces } from "@/lib/storefronts";
import { removeSellerImageAction, saveStorefrontAction, setPublishedAction } from "./actions";
import { PublishToggle } from "./publish-panel";
import { SellerImageField } from "./seller-images";
import { StorefrontForm } from "./storefront-form";

export const metadata: Metadata = { title: "Storefront · REACH" };

export default async function StorefrontEditorPage() {
  const { session, seller: me } = await requireSeller();
  const [{ seller, listingCount, check, published, suggestedLayout }, places, images] = await Promise.all([
    getStorefrontEditor(me.id),
    listPlaces(),
    getSellerImages(me.id),
  ]);
  const uploadsOff = !isStorageConfigured();
  const url = `${appUrl()}/s/${seller.slug}`;
  const area = formatArea({ areaDetail: seller.areaDetail, placeName: seller.place?.name, location: seller.location, province: seller.province });
  const whatsappShare = `https://wa.me/?text=${encodeURIComponent(`Have a look at ${seller.businessName} on REACH: ${url}?src=whatsapp`)}`;

  return (
    <div className="min-h-screen bg-ink-100">
      <SellerHeader email={session.user.email} current="storefront" />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 sm:text-3xl">Your storefront</h1>
          <p className="mt-1 text-ink-700">
            Your own page on REACH, at <span className="font-mono text-sm">/s/{seller.slug}</span>. Share it anywhere: customers can see what
            you offer and contact you.
          </p>
        </div>

        <section aria-labelledby="status" className="rounded-2xl border border-ink-300/60 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="status" className="text-lg font-semibold text-ink-900">
              {published ? "Your storefront is published" : "Not published yet"}
            </h2>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                published ? "bg-brand-100 text-brand-700" : "bg-amber-100 text-amber-800"
              }`}
            >
              {published ? "Published" : "Unpublished"}
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-500">
            {published
              ? "Anyone with the link can see it, and it can appear in search engines. Your WhatsApp number isn't shown on the page."
              : "Only you can see it. Publish when you're ready for customers."}
          </p>

          {!published && (
            <ul className="mt-4 space-y-1.5 text-sm">
              {[
                ["Town or city chosen", Boolean(seller.placeId)],
                [`At least one product or service (${listingCount} listed)`, listingCount > 0],
                ["WhatsApp number in your profile", Boolean(seller.whatsappNumber)],
              ].map(([label, ok]) => (
                <li key={String(label)} className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
                      ok ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-500"
                    }`}
                  >
                    {ok ? "✓" : ""}
                  </span>
                  <span className={ok ? "text-ink-900" : "text-ink-700"}>
                    {label}
                    <span className="sr-only">{ok ? " (done)" : " (to do)"}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="sm:w-60">
              <PublishToggle action={setPublishedAction.bind(null, !published)} published={published} ready={check.ok} />
            </div>
            <a href={`/s/${seller.slug}`} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-brand-700 hover:underline">
              {published ? "View your storefront" : "Preview your storefront"} ↗
            </a>
            {listingCount === 0 && (
              <Link href="/products/new" className="text-sm font-semibold text-brand-700 hover:underline">
                Add a product or service
              </Link>
            )}
          </div>

          {published && (
            <div className="mt-5 border-t border-ink-100 pt-4">
              <h3 className="font-semibold text-ink-900">Share your storefront</h3>
              <p className="mt-1 text-sm text-ink-500">Use the link for each place you share it, so you can see where enquiries come from.</p>
              <a
                href={whatsappShare}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block rounded-lg bg-[#1fa855] px-4 py-2 text-sm font-semibold text-white hover:bg-[#178a45]"
              >
                Share on WhatsApp
              </a>
              <ul className="mt-3 divide-y divide-ink-100">
                {SHARE_CHANNELS.map((c) => (
                  <CopyLink key={c.src} label={`For ${CHANNELS[c.channel]}`} url={`${url}?src=${c.src}`} />
                ))}
                <CopyLink label="Plain link" url={url} />
              </ul>
            </div>
          )}
        </section>

        <section aria-labelledby="images" className="rounded-2xl border border-ink-300/60 bg-white p-5 sm:p-6">
          <h2 id="images" className="text-lg font-semibold text-ink-900">
            Logo and cover photo
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            Optional, but they make your storefront easier to recognise. Location and camera details are removed from every
            photo before it&apos;s saved.
          </p>
          <div className="mt-5 grid gap-6 sm:grid-cols-[1fr_2fr]">
            <SellerImageField
              target="logo"
              title="Logo"
              hint="Square works best. Shown as a circle."
              photo={images.logo}
              businessName={seller.businessName}
              remove={removeSellerImageAction.bind(null, "logo")}
              uploadsOff={uploadsOff}
            />
            <SellerImageField
              target="cover"
              title="Cover photo"
              hint="A wide photo of your work or stall, shown across the top."
              photo={images.cover}
              businessName={seller.businessName}
              remove={removeSellerImageAction.bind(null, "cover")}
              uploadsOff={uploadsOff}
            />
          </div>
        </section>

        <section aria-labelledby="details" className="rounded-2xl border border-ink-300/60 bg-white p-5 sm:p-6">
          <h2 id="details" className="text-lg font-semibold text-ink-900">
            Storefront details
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            {area ? `Shown as: ${area}. ` : ""}Business name and WhatsApp number come from your{" "}
            <Link href="/onboarding?step=1" className="font-semibold text-brand-700 hover:underline">
              business profile
            </Link>
            .
          </p>
          <div className="mt-5">
            <StorefrontForm
              action={saveStorefrontAction}
              places={places}
              delivers={seller.fulfilment.includes("DELIVERY")}
              initial={{
                tagline: seller.tagline ?? "",
                description: seller.description ?? "",
                placeId: seller.placeId ?? "",
                areaDetail: seller.areaDetail ?? (seller.placeId ? "" : (seller.location ?? "")),
                serviceRadiusKm: seller.serviceRadiusKm ? String(seller.serviceRadiusKm) : "",
                layout: suggestedLayout,
              }}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
