import Link from "next/link";
import { CaptureLabel } from "@/components/capture-label";
import { FollowButton } from "@/components/follow-button";
import { Photo } from "@/components/photo";
import type { ExploreSellerCard, exploreLatestWork } from "@/lib/explore";
import { formatPrice } from "@/lib/product-rules";
import { SellerAvatar } from "../feed/feed-parts";

// Links from Explore carry ?src=reach, so sellers see what REACH brings them.
const fromReach = (path: string) => `${path}?src=reach`;

export function SellerCard({
  card,
  following,
  signedIn,
  own,
  returnPath,
}: {
  card: ExploreSellerCard;
  following: boolean;
  signedIn: boolean;
  own: boolean; // the viewer's own storefront: no Follow button
  returnPath: string;
}) {
  const href = fromReach(`/s/${card.slug}`);
  return (
    <li className="overflow-hidden rounded-2xl border border-ink-300/60 bg-white">
      <div className="flex gap-3 p-3">
        <Link href={href} className="shrink-0">
          {card.image ? (
            <Photo photo={card.image} alt={`Work by ${card.businessName}`} sizes="112px" className="h-28 w-28 rounded-xl bg-ink-100 object-cover" />
          ) : (
            <span className="flex h-28 w-28 items-center justify-center rounded-xl bg-ink-100">
              <SellerAvatar name={card.businessName} logo={card.logo} className="h-14 w-14 text-2xl" />
            </span>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <Link href={href} className="block truncate font-semibold text-ink-900 hover:underline">
            {card.businessName}
          </Link>
          <p className="truncate text-xs text-ink-500">{[card.area, card.category].filter(Boolean).join(" · ")}</p>
          {card.tagline && <p className="mt-1 line-clamp-2 text-sm text-ink-700">{card.tagline}</p>}
          {card.reasons.length > 0 && (
            <ul aria-label="Why this seller is shown" className="mt-2 flex flex-wrap gap-1">
              {card.reasons.map((r) => (
                <li key={r} className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-800">
                  {r}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {card.matches.length > 0 && (
        <ul aria-label="Matching items" className="space-y-1 border-t border-ink-100 px-3 py-2 text-sm">
          {card.matches.map((m) => (
            <li key={m.slug}>
              <Link href={fromReach(`/s/${card.slug}/${m.slug}`)} className="flex justify-between gap-3 hover:underline">
                <span className="truncate text-ink-900">{m.name}</span>
                <span className="shrink-0 text-ink-700">{formatPrice(m.priceType, m.price)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center justify-between gap-2 border-t border-ink-100 px-3 py-2">
        {own ? (
          <span className="text-xs text-ink-500">Your storefront</span>
        ) : (
          <FollowButton sellerSlug={card.slug} businessName={card.businessName} following={following} signedIn={signedIn} returnPath={returnPath} size="sm" />
        )}
        <Link href={href} className="text-sm font-semibold text-brand-700 hover:underline">
          View storefront
        </Link>
      </div>
    </li>
  );
}

type Tile = Awaited<ReturnType<typeof exploreLatestWork>>["tiles"][number];

export function WorkGrid({ tiles }: { tiles: Tile[] }) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {tiles.map((t) => (
        <li key={t.code} className="overflow-hidden rounded-xl border border-ink-300/60 bg-white">
          <Link href={fromReach(`/s/${t.seller.slug}/posts/${t.code}`)} className="relative block aspect-square bg-ink-100">
            <Photo
              photo={t.photo}
              alt={t.caption ? `Post by ${t.seller.businessName}: ${t.caption.slice(0, 100)}` : `Post by ${t.seller.businessName}`}
              sizes="(min-width: 640px) 220px, 50vw"
              className="h-full w-full object-cover"
            />
            <CaptureLabel source={t.photo.captureSource} capturedAt={t.photo.capturedAt} className="absolute bottom-1.5 left-1.5 !text-[10px]" />
            {t.photoCount > 1 && (
              <span className="absolute right-1.5 top-1.5 rounded-full bg-ink-900/75 px-1.5 py-0.5 text-[10px] font-medium text-white">{t.photoCount}</span>
            )}
          </Link>
          <Link href={fromReach(`/s/${t.seller.slug}`)} className="block px-2 py-1.5 hover:bg-ink-100/60">
            <span className="block truncate text-xs font-semibold text-ink-900">{t.seller.businessName}</span>
            {t.distance && <span className="block truncate text-[11px] text-ink-500">{t.distance}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}
