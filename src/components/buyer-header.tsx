import Link from "next/link";
import { ActiveTabIntoView } from "@/components/active-tab-into-view";
import { SignOutButton } from "@/components/sign-out-button";
import { getCurrentSeller } from "@/lib/session";
import { unreadCount } from "@/lib/notifications";

const NAV = [
  { href: "/feed", label: "Feed", key: "feed" },
  { href: "/following", label: "Following", key: "following" },
  { href: "/notifications", label: "Notifications", short: "Alerts", key: "notifications" },
  { href: "/account", label: "Account", key: "account" },
] as const;

export type BuyerSection = (typeof NAV)[number]["key"];

// Header for the buying side. Every account has it; sellers also get a link
// to their shop, everyone else an invitation to start selling.
export async function BuyerHeader({ userId, current }: { userId: string; current: BuyerSection }) {
  const [seller, unread] = await Promise.all([getCurrentSeller(), unreadCount(userId)]);
  const sells = seller?.status === "ACTIVE";
  return (
    <header className="border-b border-ink-300/60 bg-white">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/feed" className="text-xl font-extrabold tracking-tight text-brand-700">
          REACH
        </Link>
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Link
            href={sells ? "/dashboard" : "/onboarding"}
            className="whitespace-nowrap rounded-lg bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-100"
          >
            {sells ? "Your shop" : seller ? "Finish seller setup" : "Become a seller"}
          </Link>
          <SignOutButton />
        </div>
      </div>
      <nav aria-label="Buyer" className="mx-auto max-w-4xl px-4">
        <ul className="-mb-px flex gap-4 overflow-x-auto text-sm font-medium sm:gap-6">
          {NAV.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                aria-current={item.key === current ? "page" : undefined}
                className={`inline-block whitespace-nowrap border-b-2 py-2.5 ${
                  item.key === current ? "border-brand-600 text-brand-700" : "border-transparent text-ink-500 hover:text-ink-900"
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
                {item.key === "notifications" && unread > 0 && <UnreadBadge count={unread} />}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <ActiveTabIntoView navLabel="Buyer" />
    </header>
  );
}

export function UnreadBadge({ count }: { count: number }) {
  return (
    <span className="ml-1.5 rounded-full bg-sky-600 px-1.5 py-0.5 text-xs font-semibold text-white">
      {count > 99 ? "99+" : count}
      <span className="sr-only"> unread</span>
    </span>
  );
}
