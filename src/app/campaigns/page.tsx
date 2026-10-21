import type { Metadata } from "next";
import Link from "next/link";
import { SourceBadge } from "@/components/campaign-ui";
import { SellerHeader } from "@/components/seller-header";
import { personalise } from "@/lib/campaign-rules";
import { listCampaignLibrary, listSellerCampaigns } from "@/lib/campaigns";
import { requireSeller } from "@/lib/session";

export const metadata: Metadata = { title: "Campaigns · REACH" };

export default async function CampaignsPage() {
  const { session, seller } = await requireSeller();
  const [library, mine] = await Promise.all([listCampaignLibrary(seller.id), listSellerCampaigns(seller.id)]);
  const available = library.filter((m) => !m.sellerCampaignId);
  const facts = { businessName: seller.businessName, location: seller.location };

  return (
    <div className="min-h-screen bg-ink-100">
      <SellerHeader email={session.user.email} current="campaigns" />
      <main className="mx-auto max-w-4xl space-y-10 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 sm:text-3xl">Campaigns</h1>
          <p className="mt-1 text-ink-700">
            Professional campaigns for your categories. Personalise one and it&apos;s ready with your business details.
          </p>
        </div>

        {mine.length > 0 && (
          <section aria-labelledby="mine">
            <h2 id="mine" className="text-lg font-semibold text-ink-900">
              Your campaigns
            </h2>
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {mine.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/campaigns/${c.id}`}
                    className="block h-full rounded-xl border border-ink-300/60 bg-white p-4 transition hover:border-brand-500 hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 font-semibold text-ink-900">{c.headline}</p>
                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        {c.status === "DRAFT" ? "Draft" : c.status === "ACTIVE" ? "Active" : "Paused"}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-ink-500">
                      {c.masterCampaign.category.name}
                      {c.product && ` · ${c.product.name}`}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="library">
          <h2 id="library" className="text-lg font-semibold text-ink-900">
            Available for your categories
          </h2>
          {available.length === 0 ? (
            <div className="mt-3 rounded-2xl border border-dashed border-ink-300 bg-white px-6 py-10 text-center">
              <p className="font-medium text-ink-900">
                {library.length === 0 ? "No campaigns for your categories yet." : "You've personalised every available campaign."}
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm text-ink-700">
                REACH adds new campaigns for each category over time. They&apos;ll appear here as soon as they&apos;re
                published.
              </p>
            </div>
          ) : (
            <ul className="mt-3 grid gap-3 sm:grid-cols-2">
              {available.map((m) => (
                <li key={m.id} className="flex flex-col rounded-xl border border-ink-300/60 bg-white p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium uppercase tracking-wide text-ink-500">{m.category.name}</span>
                    <SourceBadge source={m.source} />
                  </div>
                  {/* Previewed with this seller's own details already filled in. */}
                  <p className="mt-2 font-semibold text-ink-900">{personalise(m.headline, facts)}</p>
                  <p className="mt-1 line-clamp-3 text-sm text-ink-700">{personalise(m.body, facts)}</p>
                  <div className="mt-4 flex-1" />
                  <Link
                    href={`/campaigns/personalise/${m.id}`}
                    className="rounded-lg bg-brand-600 px-4 py-2.5 text-center font-semibold text-white transition hover:bg-brand-700"
                  >
                    Personalise
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
