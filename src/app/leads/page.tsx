import type { Metadata } from "next";
import Link from "next/link";
import { SellerHeader } from "@/components/seller-header";
import { CHANNELS, LEAD_STATUSES, leadStatusSchema, whatsappLink } from "@/lib/lead-rules";
import { countLeadsByStatus, listLeads } from "@/lib/leads";
import { formatWhatsappNumber } from "@/lib/seller-profile";
import { requireSeller } from "@/lib/session";
import { DeleteLeadButton } from "./delete-lead";
import { LeadStatusSelect } from "./status-select";

export const metadata: Metadata = { title: "Leads · REACH" };

const dateFormat = new Intl.DateTimeFormat("en-ZA", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Africa/Johannesburg",
});

export default async function LeadsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { session, seller } = await requireSeller();
  const parsed = leadStatusSchema.safeParse((await searchParams).status);
  const filter = parsed.success ? parsed.data : undefined;
  const [leads, counts] = await Promise.all([listLeads(seller.id, filter), countLeadsByStatus(seller.id)]);

  return (
    <div className="min-h-screen bg-ink-100">
      <SellerHeader email={session.user.email} current="leads" />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-bold text-ink-900 sm:text-3xl">Leads</h1>
        <p className="mt-1 text-ink-700">People who asked to hear from you through your campaigns.</p>
        <p className="mt-2 text-sm text-ink-500">
          If someone asks you to delete their details, use Delete on their lead. It removes their name, number and
          message permanently.
        </p>

        <nav aria-label="Filter by status" className="mt-6 flex gap-2 overflow-x-auto pb-1 text-sm">
          {[{ value: undefined, label: "All", count: counts.total }, ...LEAD_STATUSES.map((s) => ({ ...s, count: counts[s.value] ?? 0 }))].map(
            (tab) => {
              const active = tab.value === filter;
              return (
                <Link
                  key={tab.label}
                  href={tab.value ? `/leads?status=${tab.value}` : "/leads"}
                  aria-current={active ? "page" : undefined}
                  className={`whitespace-nowrap rounded-full px-3 py-1 font-medium ${
                    active ? "bg-ink-900 text-white" : "bg-white text-ink-700 hover:bg-ink-300/40"
                  }`}
                >
                  {tab.label} ({tab.count})
                </Link>
              );
            },
          )}
        </nav>

        {leads.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-ink-300 bg-white px-6 py-12 text-center">
            {counts.total === 0 ? (
              <>
                <h2 className="text-lg font-semibold text-ink-900">No leads yet</h2>
                <p className="mx-auto mt-2 max-w-md text-ink-700">
                  When someone sends an enquiry from one of your published campaigns, it appears here.
                </p>
                <Link
                  href="/campaigns"
                  className="mt-6 inline-block rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700"
                >
                  Go to your campaigns
                </Link>
              </>
            ) : (
              <p className="text-ink-700">No leads with this status.</p>
            )}
          </div>
        ) : (
          <ul className="mt-6 space-y-3">
            {leads.map((lead) => (
              <li key={lead.id} className="rounded-xl border border-ink-300/60 bg-white p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-900">{lead.name}</p>
                    <p className="text-sm text-ink-500">{dateFormat.format(lead.createdAt)}</p>
                  </div>
                  <LeadStatusSelect leadId={lead.id} status={lead.status} leadName={lead.name} />
                </div>

                {lead.message && (
                  <p className="mt-3 whitespace-pre-line rounded-lg bg-ink-100 px-3 py-2 text-ink-900">{lead.message}</p>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={whatsappLink(lead.contact, `Hi ${lead.name}, thanks for your enquiry to ${seller.businessName}.`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg bg-[#1fa855] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#178a45]"
                  >
                    WhatsApp {formatWhatsappNumber(lead.contact)}
                  </a>
                  <a
                    href={`tel:${lead.contact}`}
                    className="rounded-lg border border-ink-300 px-3 py-1.5 text-sm font-semibold text-ink-700 hover:bg-ink-100"
                  >
                    Call
                  </a>
                  <div className="ml-auto">
                    <DeleteLeadButton leadId={lead.id} leadName={lead.name} />
                  </div>
                </div>

                <p className="mt-3 text-xs text-ink-500">
                  Source:{" "}
                  {lead.sellerCampaign ? (
                    <Link href={`/campaigns/${lead.sellerCampaign.id}`} className="font-medium text-ink-700 hover:underline">
                      {lead.sellerCampaign.headline}
                    </Link>
                  ) : (
                    "a campaign that has since been removed"
                  )}{" "}
                  · Channel: {CHANNELS[lead.channel]}
                </p>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
