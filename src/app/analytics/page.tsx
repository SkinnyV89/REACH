import type { Metadata } from "next";
import Link from "next/link";
import { SourceBadge } from "@/components/campaign-ui";
import { HBarChart, StatTile } from "@/components/charts";
import { SellerHeader } from "@/components/seller-header";
import { PERIODS, describeHighlights, formatRate, getSellerAnalytics, parsePeriod, rate } from "@/lib/analytics";
import { requireSeller } from "@/lib/session";

export const metadata: Metadata = { title: "Analytics · REACH" };

const STATUS_LABEL = { ACTIVE: "Published", PAUSED: "Paused", DRAFT: "Draft" } as const;
const n = (v: number) => v.toLocaleString("en-ZA");

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const { session, seller } = await requireSeller();
  const period = parsePeriod((await searchParams).period);
  const a = await getSellerAnalytics(seller.id, period.days);
  const { funnel } = a;
  const highlights = describeHighlights(a);

  const channelBars = [...a.channels]
    // Most enquiries first; "Unknown" always last so it doesn't read as a channel.
    .sort((x, y) => Number(x.channel === "UNKNOWN") - Number(y.channel === "UNKNOWN") || y.leads - x.leads)
    .map((c) => ({
      key: c.channel,
      label: c.label,
      value: c.leads,
      muted: c.channel === "UNKNOWN",
      detail: `${n(c.views)} views · ${n(c.clicks)} WhatsApp taps · ${n(c.leads)} enquiries`,
    }));

  return (
    <div className="min-h-screen bg-ink-100">
      <SellerHeader email={session.user.email} current="analytics" />
      <main className="mx-auto max-w-4xl space-y-8 px-4 py-8">
        <div>
          <h1 className="text-2xl font-bold text-ink-900 sm:text-3xl">Analytics</h1>
          <p className="mt-1 text-ink-700">How your campaigns are doing, from what REACH measured on your campaign pages.</p>
        </div>

        {/* Filters: one row above the charts. */}
        <nav aria-label="Time period" className="flex flex-wrap gap-2 text-sm">
          {PERIODS.map((p) => (
            <Link
              key={p.key}
              href={p.key === "30d" ? "/analytics" : `/analytics?period=${p.key}`}
              aria-current={p.key === period.key ? "page" : undefined}
              className={`whitespace-nowrap rounded-full px-3 py-1 font-medium ${
                p.key === period.key ? "bg-ink-900 text-white" : "bg-white text-ink-700 hover:bg-ink-300/40"
              }`}
            >
              {p.days ? `Last ${p.label}` : p.label}
            </Link>
          ))}
        </nav>

        {!a.hasData ? (
          <div className="rounded-2xl border border-dashed border-ink-300 bg-white px-6 py-12 text-center">
            <h2 className="text-lg font-semibold text-ink-900">No results {period.days ? `in the last ${period.label}` : "yet"}</h2>
            <p className="mx-auto mt-2 max-w-md text-ink-700">
              Views, WhatsApp taps and enquiries appear here once people open your published campaigns.
            </p>
            <Link
              href="/campaigns"
              className="mt-6 inline-block rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700"
            >
              Go to your campaigns
            </Link>
          </div>
        ) : (
          <>
            <section aria-labelledby="funnel" className="space-y-4">
              <h2 id="funnel" className="text-lg font-semibold text-ink-900">
                From views to enquiries
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatTile label="Page views" value={n(funnel.views)} />
                <StatTile label="WhatsApp taps" value={n(funnel.clicks)} note={`${formatRate(rate(funnel.clicks, funnel.views))} of views`} />
                <StatTile label="Enquiries" value={n(funnel.leads)} note={`${formatRate(rate(funnel.leads, funnel.views))} of views`} />
                <StatTile label="Converted" value={n(funnel.converted)} note="Marked by you in Leads" />
              </div>
              <div className="rounded-2xl border border-ink-300/60 bg-white p-5">
                <HBarChart
                  valueLabel=""
                  rows={[
                    { key: "views", label: "Page views", value: funnel.views },
                    { key: "clicks", label: "WhatsApp taps", value: funnel.clicks, detail: `${formatRate(rate(funnel.clicks, funnel.views))} of page views` },
                    { key: "leads", label: "Enquiries", value: funnel.leads, detail: `${formatRate(rate(funnel.leads, funnel.views))} of page views` },
                  ]}
                />
                <p className="mt-4 text-xs text-ink-500">
                  WhatsApp taps and enquiries are separate actions: a visitor can do either or both, so both are shown as a share of
                  page views. A tap means the WhatsApp button was tapped; WhatsApp doesn&apos;t tell us whether a message was sent.
                </p>
              </div>
            </section>

            {highlights.length > 0 && (
              <section aria-label="Highlights" className="rounded-2xl border border-brand-200 bg-brand-50 p-5">
                <ul className="list-disc space-y-1 pl-5 text-sm text-brand-900">
                  {highlights.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </section>
            )}

            <section aria-labelledby="channels" className="rounded-2xl border border-ink-300/60 bg-white p-5">
              <h2 id="channels" className="text-lg font-semibold text-ink-900">
                Enquiries by channel
              </h2>
              <p className="mt-1 text-sm text-ink-500">
                From the channel tag on the link a visitor used. &ldquo;Unknown&rdquo; means the link had no tag.
              </p>
              <div className="mt-5">
                <HBarChart rows={channelBars} valueLabel="enquiries" />
              </div>
              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Views, WhatsApp taps and enquiries by channel</caption>
                  <thead className="border-b border-ink-300/60 text-ink-500">
                    <tr>
                      <th scope="col" className="py-2 pr-3 font-medium">Channel</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium sm:px-3">Views</th>
                      <th scope="col" className="px-2 py-2 text-right font-medium sm:px-3">
                        <span className="sm:hidden">Taps</span>
                        <span className="hidden sm:inline">WhatsApp taps</span>
                      </th>
                      <th scope="col" className="px-2 py-2 text-right font-medium sm:px-3">
                        <span className="sm:hidden">Enq.</span>
                        <span className="hidden sm:inline">Enquiries</span>
                      </th>
                      <th scope="col" className="py-2 pl-2 text-right font-medium sm:pl-3">
                        <span className="sm:hidden">Per view</span>
                        <span className="hidden sm:inline">Enquiries per view</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {a.channels.map((c) => (
                      <tr key={c.channel} className="border-b border-ink-100 last:border-0">
                        <th scope="row" className="py-2 pr-3 font-medium text-ink-900">{c.label}</th>
                        <td className="px-2 py-2 text-right sm:px-3">{n(c.views)}</td>
                        <td className="px-2 py-2 text-right sm:px-3">{n(c.clicks)}</td>
                        <td className="px-2 py-2 text-right font-semibold text-ink-900 sm:px-3">{n(c.leads)}</td>
                        <td className="py-2 pl-2 text-right sm:pl-3">{formatRate(rate(c.leads, c.views))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section aria-labelledby="campaigns" className="rounded-2xl border border-ink-300/60 bg-white p-5">
              <h2 id="campaigns" className="text-lg font-semibold text-ink-900">
                Campaign performance
              </h2>
              <p className="mt-1 text-sm text-ink-500">Each of your campaigns, with the master campaign it came from. Most enquiries first.</p>
              {a.campaigns.length === 0 ? (
                <p className="mt-4 text-sm text-ink-700">You haven&apos;t personalised any campaigns yet.</p>
              ) : (
                <>
                <ul className="mt-4 space-y-3 sm:hidden">
                  {a.campaigns.map((c) => (
                    <li key={c.id} className="rounded-xl border border-ink-300/60 p-4">
                      <Link href={`/campaigns/${c.id}`} className="font-medium text-ink-900 hover:text-brand-700 hover:underline">
                        {c.headline}
                      </Link>
                      <p className="mt-1 text-xs text-ink-500">
                        Master: {c.masterTitle} · {STATUS_LABEL[c.status]}
                      </p>
                      <div className="mt-1">
                        <SourceBadge source={c.source} />
                      </div>
                      <dl className="mt-3 grid grid-cols-3 gap-2 text-center tabular-nums">
                        {[
                          ["Views", n(c.views)],
                          ["Taps", n(c.clicks)],
                          ["Enquiries", n(c.leads)],
                          ["Converted", n(c.converted)],
                          ["Per view", formatRate(rate(c.leads, c.views))],
                        ].map(([label, value]) => (
                          <div key={label} className="rounded-lg bg-ink-100 px-2 py-2">
                            <dd className="font-semibold text-ink-900">{value}</dd>
                            <dt className="text-xs text-ink-500">{label}</dt>
                          </div>
                        ))}
                      </dl>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 hidden overflow-x-auto sm:block">
                  <table className="w-full min-w-[40rem] text-left text-sm">
                    <caption className="sr-only">Views, taps, enquiries and conversions per campaign</caption>
                    <thead className="border-b border-ink-300/60 text-ink-500">
                      <tr>
                        <th scope="col" className="py-2 pr-3 font-medium">Campaign</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">Views</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">Taps</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">Enquiries</th>
                        <th scope="col" className="px-3 py-2 text-right font-medium">Converted</th>
                        <th scope="col" className="py-2 pl-3 text-right font-medium">Enquiries per view</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {a.campaigns.map((c) => (
                        <tr key={c.id} className="border-b border-ink-100 align-top last:border-0">
                          <th scope="row" className="py-3 pr-3 font-normal">
                            <Link href={`/campaigns/${c.id}`} className="font-medium text-ink-900 hover:text-brand-700 hover:underline">
                              {c.headline}
                            </Link>
                            <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-500">
                              <span>Master: {c.masterTitle}</span>
                              <span aria-hidden>·</span>
                              <span>{c.category}</span>
                              <span aria-hidden>·</span>
                              <span>{STATUS_LABEL[c.status]}</span>
                              <SourceBadge source={c.source} />
                            </span>
                          </th>
                          <td className="px-3 py-3 text-right">{n(c.views)}</td>
                          <td className="px-3 py-3 text-right">{n(c.clicks)}</td>
                          <td className="px-3 py-3 text-right font-semibold text-ink-900">{n(c.leads)}</td>
                          <td className="px-3 py-3 text-right">{n(c.converted)}</td>
                          <td className="py-3 pl-3 text-right">{formatRate(rate(c.leads, c.views))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                </>
              )}
            </section>

            <p className="text-xs text-ink-500">
              Views and taps are counted anonymously on your published campaign pages; repeat views from the same browser within 30
              minutes and your own visits aren&apos;t counted. Views are only counted when a page loads with JavaScript, so
              enquiries per view can occasionally be higher than expected. Deleted leads are no longer counted.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
