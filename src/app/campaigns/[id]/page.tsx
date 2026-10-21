import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdPreview, SourceBadge } from "@/components/campaign-ui";
import { SellerHeader } from "@/components/seller-header";
import { shareUrl } from "@/lib/app-url";
import { getSellerCampaign } from "@/lib/campaigns";
import { formatPrice } from "@/lib/product-rules";
import { formatWhatsappNumber } from "@/lib/seller-profile";
import { requireSeller } from "@/lib/session";

export const metadata: Metadata = { title: "Your campaign · REACH" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function SellerCampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { session, seller } = await requireSeller();
  const { id } = await params;
  const { created } = await searchParams;
  // Another seller's campaign looks exactly like a missing one.
  const campaign = UUID.test(id) ? await getSellerCampaign(seller.id, id) : null;
  if (!campaign) notFound();

  const link = shareUrl(campaign.uniqueLink);
  const product = campaign.product;

  return (
    <div className="min-h-screen bg-ink-100">
      <SellerHeader email={session.user.email} current="campaigns" />
      <main className="mx-auto max-w-4xl px-4 py-8">
        {created && (
          <div role="status" className="mb-6 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
            Your campaign is created with your business details.
          </div>
        )}
        <Link href="/campaigns" className="text-sm font-semibold text-brand-700 hover:underline">
          ← Campaigns
        </Link>

        <div className="mt-3 grid gap-8 lg:grid-cols-2">
          <section className="space-y-6">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-ink-500">
                  {campaign.masterCampaign.category.name}
                </span>
                <SourceBadge source={campaign.masterCampaign.source} />
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">Draft</span>
              </div>
              <h1 className="mt-1 text-2xl font-bold text-ink-900">{campaign.headline}</h1>
            </div>

            <div className="rounded-2xl border border-ink-300/60 bg-white p-5">
              <h2 className="font-semibold text-ink-900">Your share link</h2>
              <p className="mt-2 break-all rounded-lg bg-ink-100 px-3 py-2 font-mono text-sm text-ink-900">{link}</p>
              <p className="mt-2 text-sm text-ink-500">
                This link is reserved for this campaign. The page it opens, where customers can contact you, goes live
                in the next update, so don&apos;t share it just yet.
              </p>
            </div>

            <div className="rounded-2xl border border-ink-300/60 bg-white p-5">
              <h2 className="font-semibold text-ink-900">Verified details</h2>
              <p className="mt-1 text-sm text-ink-500">
                From your profile and products, never written by the AI. Customers will see these next to the advert.
              </p>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-ink-500">WhatsApp</dt>
                  <dd className="font-medium text-ink-900">{formatWhatsappNumber(seller.whatsappNumber) || "Not set"}</dd>
                </div>
                {product ? (
                  <>
                    <div className="flex justify-between gap-4">
                      <dt className="text-ink-500">{product.kind === "SERVICE" ? "Service" : "Product"}</dt>
                      <dd className="text-right font-medium text-ink-900">{product.name}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-ink-500">Price</dt>
                      <dd className="font-medium text-ink-900">{formatPrice(product.priceType, product.price)}</dd>
                    </div>
                    {product.status !== "AVAILABLE" && (
                      <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-800">
                        This item is currently {product.status === "ARCHIVED" ? "archived" : "marked unavailable"}.
                      </p>
                    )}
                  </>
                ) : (
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-500">Product</dt>
                    <dd className="text-ink-700">None featured</dd>
                  </div>
                )}
              </dl>
            </div>
          </section>

          <section aria-label="Preview">
            <p className="mb-3 text-center text-sm font-medium text-ink-500">Preview</p>
            <AdPreview
              businessName={seller.businessName}
              location={seller.location}
              headline={campaign.headline}
              body={campaign.body}
              callToAction={campaign.callToAction}
              footer={
                product && (
                  <p className="mt-3 text-center text-sm text-ink-700">
                    {product.name} · <span className="font-semibold">{formatPrice(product.priceType, product.price)}</span>
                  </p>
                )
              }
            />
          </section>
        </div>
      </main>
    </div>
  );
}
