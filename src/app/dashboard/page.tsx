import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { FULFILMENT_OPTIONS, formatWhatsappNumber, provinceLabel } from "@/lib/seller-profile";
import { requireSeller } from "@/lib/session";
import { SellerHeader } from "@/components/seller-header";
import { countProducts } from "@/lib/products";

export const metadata: Metadata = { title: "Dashboard · REACH" };

type StepState = "done" | "next" | "later";

// The seller journey. States reflect what actually exists in the product
// today; steps that are not built yet are labelled, not linked.
function journey(productCount: number): { title: string; detail: string; state: StepState; href?: string }[] {
  return [
  { title: "Create your account", detail: "You're signed in.", state: "done" },
  { title: "Set up your business profile", detail: "Customers will know who you are and how to reach you.", state: "done" },
  productCount > 0
    ? {
        title: "Add a product or service",
        detail: `${productCount} listed. Add more any time.`,
        state: "done",
        href: "/products",
      }
    : {
        title: "Add a product or service",
        detail: "What you want customers to discover.",
        state: "next",
        href: "/products/new",
      },
  { title: "Personalise a campaign", detail: "A professional campaign made yours.", state: "later" },
  { title: "Share it and capture leads", detail: "Reach people beyond your contacts.", state: "later" },
  ];
}

const badge: Record<StepState, { label: string; className: string }> = {
  done: { label: "Done", className: "bg-brand-100 text-brand-700" },
  next: { label: "Up next", className: "bg-amber-100 text-amber-800" },
  later: { label: "Coming soon", className: "bg-ink-100 text-ink-500" },
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { session, seller } = await requireSeller();
  const { welcome } = await searchParams;
  const [categories, productCounts] = await Promise.all([
    db.sellerCategory.findMany({
    where: { sellerId: seller.id },
    select: { category: { select: { name: true } } },
    orderBy: { category: { sortOrder: "asc" } },
    }),
    countProducts(seller.id),
  ]);
  const steps = journey(productCounts.active);
  const firstName = session.user.name.split(" ")[0] || "there";
  const place = [seller.location, provinceLabel(seller.province)].filter(Boolean).join(", ");
  const fulfilment = FULFILMENT_OPTIONS.filter((f) => seller.fulfilment.includes(f.value)).map((f) => f.label);
  const links = [
    ["Instagram", seller.instagramUrl],
    ["Facebook", seller.facebookUrl],
    ["TikTok", seller.tiktokUrl],
    ["Website", seller.websiteUrl],
  ].filter((l): l is [string, string] => Boolean(l[1]));

  return (
    <div className="min-h-screen bg-ink-100">
      <SellerHeader email={session.user.email} current="dashboard" />

      <main className="mx-auto max-w-4xl px-4 py-8">
        {welcome && (
          <div role="status" className="mb-6 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-brand-900">
            <p className="font-semibold">Your business profile is set up.</p>
            <p className="text-sm">
              Next,{" "}
              <Link href="/products/new" className="font-semibold underline">
                add your first product or service
              </Link>
              .
            </p>
          </div>
        )}

        <h1 className="text-2xl font-bold text-ink-900 sm:text-3xl">Hi {firstName}, welcome to REACH</h1>
        <p className="mt-2 text-ink-700">
          Let&apos;s get {seller.businessName} in front of customers beyond the people you already know.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-5">
          <section aria-labelledby="profile" className="rounded-2xl border border-ink-300/60 bg-white p-5 sm:p-6 lg:col-span-2">
            <div className="flex items-start justify-between gap-3">
              <h2 id="profile" className="text-lg font-semibold text-ink-900">
                Your business
              </h2>
              <Link href="/onboarding?step=1" className="text-sm font-semibold text-brand-700 hover:underline">
                Edit
              </Link>
            </div>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-ink-500">Business name</dt>
                <dd className="font-medium text-ink-900">{seller.businessName}</dd>
              </div>
              <div>
                <dt className="text-ink-500">WhatsApp</dt>
                <dd className="font-medium text-ink-900">{formatWhatsappNumber(seller.whatsappNumber) || "Not set"}</dd>
              </div>
              <div>
                <dt className="flex items-center justify-between text-ink-500">
                  What you sell
                  <Link href="/onboarding?step=2" className="font-semibold text-brand-700 hover:underline">
                    Edit
                  </Link>
                </dt>
                <dd className="mt-1 flex flex-wrap gap-1.5">
                  {categories.map(({ category }) => (
                    <span key={category.name} className="rounded-full bg-brand-50 px-2.5 py-0.5 text-xs font-medium text-brand-700">
                      {category.name}
                    </span>
                  ))}
                </dd>
              </div>
              {place && (
                <div>
                  <dt className="text-ink-500">Location</dt>
                  <dd className="font-medium text-ink-900">{place}</dd>
                </div>
              )}
              {fulfilment.length > 0 && (
                <div>
                  <dt className="text-ink-500">Fulfilment</dt>
                  <dd className="font-medium text-ink-900">
                    {fulfilment.join(" · ")}
                    {seller.serviceArea && <span className="block font-normal text-ink-700">{seller.serviceArea}</span>}
                  </dd>
                </div>
              )}
              <div>
                <dt className="flex items-center justify-between text-ink-500">
                  Links
                  <Link href="/onboarding?step=3" className="font-semibold text-brand-700 hover:underline">
                    Edit
                  </Link>
                </dt>
                <dd className="font-medium text-ink-900">
                  {links.length ? links.map(([label]) => label).join(" · ") : "None added"}
                </dd>
              </div>
              <div>
                <dt className="text-ink-500">Your public page address</dt>
                <dd className="font-mono text-ink-900">/seller/{seller.slug}</dd>
                <dd className="text-xs text-ink-500">Reserved for you. Your public page goes live in a later update.</dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="journey" className="rounded-2xl border border-ink-300/60 bg-white p-5 sm:p-6 lg:col-span-3">
            <h2 id="journey" className="text-lg font-semibold text-ink-900">
              Your path to more customers
            </h2>
            <ol className="mt-4 divide-y divide-ink-100">
              {steps.map((step, i) => (
                <li key={step.title} className="flex items-start gap-4 py-4">
                  <span
                    aria-hidden
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      step.state === "done" ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-700"
                    }`}
                  >
                    {step.state === "done" ? "✓" : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {step.href ? (
                        <Link href={step.href} className="font-medium text-ink-900 hover:text-brand-700 hover:underline">
                          {step.title}
                        </Link>
                      ) : (
                        <p className="font-medium text-ink-900">{step.title}</p>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge[step.state].className}`}>
                        {badge[step.state].label}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm text-ink-500">{step.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </main>
    </div>
  );
}
