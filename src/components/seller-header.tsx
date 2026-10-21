import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";

const NAV = [
  { href: "/dashboard", label: "Dashboard", key: "dashboard" },
  { href: "/products", label: "Products & services", key: "products" },
  { href: "/campaigns", label: "Campaigns", key: "campaigns" },
] as const;

export type SellerSection = (typeof NAV)[number]["key"];

export function SellerHeader({ email, current }: { email: string; current: SellerSection }) {
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
        <ul className="-mb-px flex gap-5 overflow-x-auto text-sm font-medium">
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
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
