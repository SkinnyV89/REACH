import type { Metadata } from "next";
import { getCurrentSeller, requireSession } from "@/lib/session";
import { SignOutButton } from "./sign-out-button";

export const metadata: Metadata = { title: "Dashboard · REACH" };

type StepState = "done" | "next" | "later";

// The seller journey. States reflect what actually exists in the product
// today; steps that are not built yet are labelled, not linked.
function journey(hasSellerProfile: boolean): { title: string; detail: string; state: StepState }[] {
  return [
    { title: "Create your account", detail: "You're signed in.", state: "done" },
    {
      title: "Set up your business profile",
      detail: hasSellerProfile
        ? "Your business profile is set up."
        : "Business name, WhatsApp number, categories and location. Arriving in the next update.",
      state: hasSellerProfile ? "done" : "next",
    },
    { title: "Add a product or service", detail: "What you want customers to discover.", state: "later" },
    { title: "Personalise a campaign", detail: "A professional campaign made yours.", state: "later" },
    { title: "Share it and capture leads", detail: "Reach people beyond your contacts.", state: "later" },
  ];
}

const badge: Record<StepState, { label: string; className: string }> = {
  done: { label: "Done", className: "bg-brand-100 text-brand-700" },
  next: { label: "Up next", className: "bg-amber-100 text-amber-800" },
  later: { label: "Coming soon", className: "bg-ink-100 text-ink-500" },
};

export default async function DashboardPage() {
  const session = await requireSession();
  const seller = await getCurrentSeller();
  const firstName = session.user.name.split(" ")[0] || "there";
  const steps = journey(Boolean(seller));

  return (
    <div className="min-h-screen bg-ink-100">
      <header className="border-b border-ink-300/60 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3">
          <span className="text-xl font-extrabold tracking-tight text-brand-700">REACH</span>
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden truncate text-sm text-ink-500 sm:inline">{session.user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-bold text-ink-900 sm:text-3xl">Hi {firstName}, welcome to REACH</h1>
        <p className="mt-2 text-ink-700">
          {seller
            ? `You're set up as ${seller.businessName}.`
            : "Let's get your side hustle in front of customers beyond the people you already know."}
        </p>

        <section aria-labelledby="journey" className="mt-8 rounded-2xl border border-ink-300/60 bg-white p-5 sm:p-6">
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
                    <p className="font-medium text-ink-900">{step.title}</p>
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
      </main>
    </div>
  );
}
