import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getOnboardingState, type OnboardingStep } from "@/lib/onboarding";
import { formatWhatsappNumber } from "@/lib/seller-profile";
import { requireSession } from "@/lib/session";
import { BusinessStep, CategoriesStep, ExtrasStep } from "./steps";

export const metadata: Metadata = { title: "Set up your business · REACH" };

const STEPS: { title: string; subtitle: string }[] = [
  { title: "Your business", subtitle: "Who you are and how customers can reach you." },
  { title: "What you sell", subtitle: "Your categories, location and how customers get your products." },
  { title: "Your links", subtitle: "Optional extras that help customers trust you." },
];

function parseStep(raw: string | string[] | undefined): OnboardingStep | null {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return n === 1 || n === 2 || n === 3 ? n : null;
}

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string | string[] }>;
}) {
  const session = await requireSession();
  const { seller, categories, selectedCategoryIds, furthest } = await getOnboardingState(session.user.id);
  const requested = parseStep((await searchParams).step);
  const isActive = seller?.status === "ACTIVE";

  // Finished sellers land on the dashboard unless they asked to edit a step.
  if (isActive && !requested) redirect("/dashboard");

  // Never show a step whose prerequisites are missing.
  const step = Math.min(requested ?? furthest, furthest) as OnboardingStep;
  const { title, subtitle } = STEPS[step - 1];

  return (
    <div className="min-h-screen bg-ink-100">
      <header className="border-b border-ink-300/60 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <span className="text-xl font-extrabold tracking-tight text-brand-700">REACH</span>
          {isActive ? (
            <Link href="/dashboard" className="text-sm font-semibold text-brand-700 hover:underline">
              Back to dashboard
            </Link>
          ) : (
            // Selling is optional: buyers can leave setup and come back any time.
            <Link href="/feed" className="text-sm font-semibold text-brand-700 hover:underline">
              Not now, back to my feed
            </Link>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
        {!seller && (
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-ink-900">Start selling on REACH</h1>
            <p className="mt-1 text-ink-700">
              Set up your business in three short steps. You keep your account and your feed; selling is added to it.
            </p>
          </div>
        )}
        <nav aria-label="Setup progress">
          <ol className="flex items-center gap-2">
            {STEPS.map((s, i) => {
              const n = (i + 1) as OnboardingStep;
              const state = n === step ? "current" : n <= furthest ? "reachable" : "locked";
              const pill = (
                <span
                  className={`flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${
                    state === "current"
                      ? "bg-brand-600 text-white"
                      : state === "reachable"
                        ? "bg-brand-100 text-brand-700"
                        : "bg-white text-ink-500"
                  }`}
                >
                  <span aria-hidden>{n}</span>
                  <span className={state === "current" ? "" : "hidden sm:inline"}>{s.title}</span>
                </span>
              );
              return (
                <li key={s.title} aria-current={state === "current" ? "step" : undefined}>
                  {state === "reachable" ? <Link href={`/onboarding?step=${n}`}>{pill}</Link> : pill}
                </li>
              );
            })}
          </ol>
        </nav>

        <section className="mt-6 rounded-2xl border border-ink-300/60 bg-white p-5 shadow-sm sm:p-8">
          <p className="text-sm font-medium text-brand-700">
            Step {step} of {STEPS.length}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-ink-900">{title}</h1>
          <p className="mt-1 text-sm text-ink-500">{subtitle}</p>
          <div className="mt-6">
            {step === 1 && (
              <BusinessStep
                saved={
                  seller && {
                    businessName: seller.businessName,
                    whatsappNumber: formatWhatsappNumber(seller.whatsappNumber),
                    description: seller.description,
                  }
                }
              />
            )}
            {step === 2 && (
              <CategoriesStep
                categories={categories}
                saved={{
                  categoryIds: selectedCategoryIds,
                  province: seller?.province ?? null,
                  location: seller?.location ?? null,
                  fulfilment: seller?.fulfilment ?? [],
                  serviceArea: seller?.serviceArea ?? null,
                }}
              />
            )}
            {step === 3 && seller && (
              <ExtrasStep
                isActive={isActive}
                saved={{
                  instagramUrl: seller.instagramUrl,
                  facebookUrl: seller.facebookUrl,
                  tiktokUrl: seller.tiktokUrl,
                  websiteUrl: seller.websiteUrl,
                }}
              />
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
