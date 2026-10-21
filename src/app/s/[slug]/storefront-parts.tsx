import Link from "next/link";
import type { ReactNode } from "react";
import { formatPrice } from "@/lib/product-rules";
import {
  AVAILABILITY,
  availabilityLabel,
  formatArea,
  formatUpdated,
  serviceModeLines,
  type AvailabilityValue,
  type LayoutValue,
} from "@/lib/storefront-rules";
import type { toPublicSeller } from "@/lib/public-storefronts";

// Server-rendered pieces of the public storefront. Plain HTML and CSS, no
// client JavaScript, so pages stay light on mobile data.

export type PublicSeller = ReturnType<typeof toPublicSeller>;
export type PublicItem = {
  slug: string;
  kind: "PRODUCT" | "SERVICE";
  name: string;
  description: string | null;
  priceType: string;
  price: string | null;
  availability: AvailabilityValue;
  availabilityUpdatedAt: Date;
  leadTimeDays: number | null;
};

const monthYear = new Intl.DateTimeFormat("en-ZA", { month: "short", year: "numeric", timeZone: "Africa/Johannesburg" });

// Query string carried from the storefront to item pages and WhatsApp, so the
// channel (?src) and campaign (?c) are kept end to end.
export function carryQuery(src: string | null, code: string | null, extra: Record<string, string> = {}): string {
  const q = new URLSearchParams(extra);
  if (src) q.set("src", src);
  if (code) q.set("c", code);
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function AvailabilityBadge({ item }: { item: PublicItem }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${AVAILABILITY[item.availability].className}`}>
      {availabilityLabel(item.availability, item.kind)}
    </span>
  );
}

export function AvailabilityNote({ item }: { item: PublicItem }) {
  const lead = item.leadTimeDays && (item.availability === "PRE_ORDER" || item.availability === "MADE_TO_ORDER")
    ? ` · ready in about ${item.leadTimeDays} ${item.leadTimeDays === 1 ? "day" : "days"}`
    : "";
  return (
    <span className="text-xs text-ink-500">
      {formatUpdated(item.availabilityUpdatedAt)}
      {lead}
    </span>
  );
}

export function StorefrontHeader({ seller }: { seller: PublicSeller }) {
  const area = formatArea(seller);
  const modes = serviceModeLines(seller.fulfilment, seller.layout as LayoutValue, seller.serviceRadiusKm);
  return (
    <header className="rounded-2xl border border-ink-300/60 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-600 text-2xl font-bold text-white"
        >
          {seller.businessName.trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight text-ink-900">{seller.businessName}</h1>
          {area && <p className="mt-0.5 text-sm text-ink-700">{area}</p>}
          {seller.tagline && <p className="mt-2 text-ink-900">{seller.tagline}</p>}
        </div>
      </div>
      {/* Facts only: nothing here is a rating or an estimate. */}
      <ul className="mt-4 flex flex-wrap gap-2 text-xs" aria-label="About this seller">
        {modes.map((m) => (
          <li key={m} className="rounded-full bg-brand-50 px-2.5 py-1 font-medium text-brand-700">
            {m}
          </li>
        ))}
        {seller.categories.map((c) => (
          <li key={c} className="rounded-full bg-ink-100 px-2.5 py-1 font-medium text-ink-700">
            {c}
          </li>
        ))}
        <li className="rounded-full bg-ink-100 px-2.5 py-1 text-ink-700">On REACH since {monthYear.format(seller.memberSince)}</li>
      </ul>
    </header>
  );
}

export function Listings({
  seller,
  items,
  query,
}: {
  seller: PublicSeller;
  items: PublicItem[];
  query: string;
}) {
  if (items.length === 0) {
    return <p className="rounded-xl bg-white p-5 text-center text-ink-700">Nothing listed right now.</p>;
  }
  const href = (i: PublicItem) => `/s/${seller.slug}/${i.slug}${query}`;
  const price = (i: PublicItem) => formatPrice(i.priceType, i.price);
  const dim = (i: PublicItem) => (i.availability === "OUT_OF_STOCK" ? "opacity-70" : "");

  if (seller.layout === "PRODUCT_GRID") {
    return (
      <ul className="grid grid-cols-2 gap-3">
        {items.map((i) => (
          <li key={i.slug} className={dim(i)}>
            <Link href={href(i)} className="flex h-full flex-col rounded-xl border border-ink-300/60 bg-white p-3 hover:border-brand-500">
              <span className="font-semibold leading-snug text-ink-900">{i.name}</span>
              <span className="mt-1 font-bold text-ink-900">{price(i)}</span>
              <span className="mt-auto pt-2">
                <AvailabilityBadge item={i} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  // Portfolio (services) and menu (food) both read as a list; the menu puts
  // the price on the right like a menu board.
  return (
    <ul className="divide-y divide-ink-100 overflow-hidden rounded-xl border border-ink-300/60 bg-white">
      {items.map((i) => (
        <li key={i.slug} className={dim(i)}>
          <Link href={href(i)} className="block px-4 py-3 hover:bg-ink-100/60">
            <span className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 font-semibold text-ink-900">{i.name}</span>
              <span className="shrink-0 font-bold text-ink-900">{price(i)}</span>
            </span>
            {i.description && seller.layout === "MENU" && (
              <span className="mt-0.5 line-clamp-2 block text-sm text-ink-700">{i.description}</span>
            )}
            <span className="mt-1.5 flex flex-wrap items-center gap-2">
              <AvailabilityBadge item={i} />
              <AvailabilityNote item={i} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-6">
      <h2 id={id} className="mb-3 text-lg font-semibold text-ink-900">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function PublicFooter() {
  return (
    <footer className="mt-8 space-y-1 text-center text-xs text-ink-500">
      <p>
        Powered by{" "}
        <Link href="/" className="font-semibold text-brand-700">
          REACH
        </Link>{" "}
        ·{" "}
        <Link href="/privacy" className="underline">
          Privacy
        </Link>
      </p>
      <p>
        Place names from{" "}
        <a href="https://www.geonames.org" className="underline" rel="noopener noreferrer">
          GeoNames
        </a>{" "}
        (CC BY 4.0).
      </p>
    </footer>
  );
}

export function Unavailable() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-ink-100 px-4 text-center">
      <h1 className="text-xl font-semibold text-ink-900">This storefront isn&apos;t available right now.</h1>
      <p className="mt-2 max-w-sm text-ink-700">The seller may not have opened it yet. Please check back later.</p>
      <PublicFooter />
    </main>
  );
}

// Goes through /go/wa so the seller's number never appears in this page.
// nofollow: crawlers shouldn't follow it (and taps are only counted for
// browsers that loaded the page).
export function WhatsAppLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="nofollow noopener noreferrer"
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1fa855] px-4 py-3.5 text-lg font-semibold text-white shadow-sm transition hover:bg-[#178a45] focus:outline-none focus:ring-4 focus:ring-green-200"
    >
      <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6 fill-current">
        <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" />
      </svg>
      {label}
    </a>
  );
}

export function OwnerBanner({ live, manageHref }: { live: boolean; manageHref: string }) {
  return (
    <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
      {live
        ? "You're viewing your own storefront. Your visits aren't counted."
        : "Preview: your storefront isn't published, so customers can't see it yet."}{" "}
      <Link href={manageHref} className="font-semibold underline">
        Manage storefront
      </Link>
    </div>
  );
}
