import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdPreview, SourceBadge } from "@/components/campaign-ui";
import { SellerHeader } from "@/components/seller-header";
import { personaliseCopy } from "@/lib/campaign-rules";
import { getMasterForSeller } from "@/lib/campaigns";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/product-rules";
import { listProducts } from "@/lib/products";
import { requireSeller } from "@/lib/session";
import { personaliseAction } from "../../actions";
import { PersonaliseForm } from "./personalise-form";

export const metadata: Metadata = { title: "Personalise campaign · REACH" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PersonalisePage({ params }: { params: Promise<{ masterId: string }> }) {
  const { session, seller } = await requireSeller();
  const { masterId } = await params;
  const master = UUID.test(masterId) ? await getMasterForSeller(seller.id, masterId) : null;
  if (!master) notFound();

  const existing = await db.sellerCampaign.findUnique({
    where: { sellerId_masterCampaignId: { sellerId: seller.id, masterCampaignId: master.id } },
    select: { id: true },
  });
  if (existing) redirect(`/campaigns/${existing.id}`);

  const products = (await listProducts(seller.id)).filter((p) => p.status === "AVAILABLE");
  const copy = personaliseCopy(master, { businessName: seller.businessName, location: seller.location });

  return (
    <div className="min-h-screen bg-ink-100">
      <SellerHeader email={session.user.email} current="campaigns" />
      <main className="mx-auto grid max-w-4xl gap-8 px-4 py-8 lg:grid-cols-2">
        <section>
          <Link href="/campaigns" className="text-sm font-semibold text-brand-700 hover:underline">
            ← Campaigns
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-500">{master.category.name}</span>
            <SourceBadge source={master.source} />
          </div>
          <h1 className="mt-1 text-2xl font-bold text-ink-900">Personalise this campaign</h1>
          <p className="mt-2 text-ink-700">{master.objective}</p>

          <div className="mt-6 rounded-2xl border border-ink-300/60 bg-white p-5">
            <h2 className="font-semibold text-ink-900">Your details in this campaign</h2>
            <p className="mt-1 text-sm text-ink-500">Taken from your business profile.</p>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-500">Business name</dt>
                <dd className="text-right font-medium text-ink-900">{seller.businessName}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-500">Location</dt>
                <dd className="text-right font-medium text-ink-900">{seller.location ?? "Not set"}</dd>
              </div>
            </dl>
            <Link href="/onboarding?step=1" className="mt-3 inline-block text-sm font-semibold text-brand-700 hover:underline">
              Edit your profile
            </Link>
          </div>

          <div className="mt-6 rounded-2xl border border-ink-300/60 bg-white p-5">
            <PersonaliseForm
              action={personaliseAction.bind(null, master.id)}
              products={products.map((p) => ({ id: p.id, label: `${p.name} (${formatPrice(p.priceType, p.price)})` }))}
            />
          </div>
        </section>

        <section aria-label="Preview">
          <p className="mb-3 text-center text-sm font-medium text-ink-500">Preview</p>
          <AdPreview businessName={seller.businessName} location={seller.location} {...copy} />
        </section>
      </main>
    </div>
  );
}
