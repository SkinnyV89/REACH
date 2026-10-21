import Link from "next/link";
import { ActiveTabIntoView } from "@/components/active-tab-into-view";
import { SignOutButton } from "@/components/sign-out-button";
import { db } from "@/lib/db";
import { getCurrentSeller } from "@/lib/session";

const NAV = [
  { href: "/dashboard", label: "Dashboard", short: "Home", key: "dashboard" },
  { href: "/storefront", label: "Storefront", short: "Shop", key: "storefront" },
  { href: "/products", label: "Products & services", short: "Items", key: "products" },
  { href: "/posts", label: "Posts", key: "posts" },
  { href: "/campaigns", label: "Campaigns", short: "Promote", key: "campaigns" },
  { href: "/leads", label: "Leads", key: "leads" },
  { href: "/analytics", label: "Analytics", short: "Stats", key: "analytics" },
] as const;

export type SellerSection = (typeof NAV)[number]["key"];

export async function SellerHeader({ email, current }: { email: string; current: SellerSection }) {
  // getCurrentSeller is cached per request, so this adds one count query.
  const seller = await getCurrentSeller();
  const newLeads = seller ? await db.lead.count({ where: { sellerId: seller.id, status: "NEW" } }) : 0;
  return (
    <header className="border-b border-ink-300/60 bg-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/dashboard" className="text-xl font-extrabold tracking-tight text-brand-700">
          REACH
        </Link>
        <div className="flex min-w-0 items-center gap-3">
          <span className="hidden truncate text-sm text-ink-500 md:inline">{email}</span>
          <SignOutButton />
        </div>
      </div>
      <nav aria-label="Seller" className="mx-auto max-w-4xl px-4">
        <ul className="-mb-px flex gap-3 overflow-x-auto text-sm font-medium sm:gap-5">
          {NAV.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={item.key === current ? "page" : undefined}
                className={`inline-block whitespace-nowrap border-b-2 py-2.5 ${
                  item.key === current
                    ? "border-brand-600 text-brand-700"
                    : "border-transparent text-ink-500 hover:text-ink-900"
                }`}
              >
                {"short" in item ? (
                  <>
                    <span className="sm:hidden">{item.short}</span>
                    <span className="hidden sm:inline">{item.label}</span>
                  </>
                ) : (
                  item.label
                )}
                {item.key === "leads" && newLeads > 0 && (
                  <span className="ml-1.5 rounded-full bg-sky-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                    {newLeads}
                    <span className="sr-only"> new</span>
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <ActiveTabIntoView navLabel="Seller" />
    </header>
  );
}
