import Link from "next/link";
import { CaptureLabel } from "@/components/capture-label";
import { FollowButton } from "@/components/follow-button";
import { Photo, type PhotoData } from "@/components/photo";
import type { FeedPost } from "@/lib/feed";
import { timeAgo } from "@/lib/feed-rules";
import { formatArea } from "@/lib/storefront-rules";

type Area = Parameters<typeof formatArea>[0];

// The seller's logo, or their initial. Decorative: the name is always next to it.
export function SellerAvatar({ name, logo, className = "h-10 w-10" }: { name: string; logo: PhotoData | null; className?: string }) {
  return logo ? (
    <Photo photo={logo} kind="logo" alt="" sizes="48px" className={`shrink-0 rounded-full border border-ink-300/60 object-cover ${className}`} />
  ) : (
    <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-full bg-brand-600 font-bold text-white ${className}`}>
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

// One post in the feed.
export function FeedCard({ post }: { post: FeedPost }) {
  // ?src=reach: visits and enquiries from the feed are credited to REACH.
  const href = `/s/${post.seller.slug}/posts/${post.code}?src=reach`;
  const area = formatArea(post.seller.area as Area);
  return (
    <article className="overflow-hidden rounded-2xl border border-ink-300/60 bg-white shadow-sm">
      <header className="flex items-center gap-3 p-3">
        <SellerAvatar name={post.seller.businessName} logo={post.seller.logo} />
        <div className="min-w-0">
          <Link href={`/s/${post.seller.slug}?src=reach`} className="block truncate font-semibold text-ink-900 hover:underline">
            {post.seller.businessName}
          </Link>
          <p className="truncate text-xs text-ink-500">
            {area ? `${area} · ` : ""}
            <time dateTime={post.publishedAt.toISOString()}>{timeAgo(post.publishedAt)}</time>
          </p>
        </div>
      </header>
      <Link href={href} className="relative block bg-ink-100">
        <Photo
          photo={post.photo}
          alt={post.caption ? `Post by ${post.seller.businessName}: ${post.caption.slice(0, 100)}` : `Post by ${post.seller.businessName}`}
          sizes="(min-width: 672px) 640px, 100vw"
          className="aspect-square w-full object-cover"
        />
        <CaptureLabel source={post.photo.captureSource} capturedAt={post.photo.capturedAt} className="absolute bottom-2 left-2" />
        {post.photoCount > 1 && (
          <span className="absolute right-2 top-2 rounded-full bg-ink-900/75 px-2 py-0.5 text-xs font-medium text-white">1 / {post.photoCount}</span>
        )}
      </Link>
      <div className="p-3">
        {post.caption && <p className="line-clamp-3 whitespace-pre-line text-sm text-ink-900">{post.caption}</p>}
        <Link href={href} className="mt-1 inline-block text-sm font-semibold text-brand-700 hover:underline">
          View post
        </Link>
      </div>
    </article>
  );
}

// A "recently active" seller, with their latest post's photo.
export function DiscoveryCard({
  seller,
  following,
  returnPath,
}: {
  seller: {
    slug: string;
    businessName: string;
    logo: PhotoData | null;
    area: Area;
    tagline: string | null;
    categories: string[];
    lastPostedAt: Date;
    preview: { code: string; photo: PhotoData };
  };
  following: boolean;
  returnPath: string;
}) {
  const area = formatArea(seller.area);
  return (
    <li className="flex gap-3 rounded-2xl border border-ink-300/60 bg-white p-3">
      <Link href={`/s/${seller.slug}/posts/${seller.preview.code}?src=reach`} className="shrink-0">
        <Photo photo={seller.preview.photo} alt={`Latest post by ${seller.businessName}`} sizes="96px" className="h-24 w-24 rounded-xl bg-ink-100 object-cover" />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={`/s/${seller.slug}?src=reach`} className="block truncate font-semibold text-ink-900 hover:underline">
          {seller.businessName}
        </Link>
        <p className="truncate text-xs text-ink-500">{[area, seller.categories[0]].filter(Boolean).join(" · ")}</p>
        {seller.tagline && <p className="mt-1 line-clamp-2 text-sm text-ink-700">{seller.tagline}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <FollowButton sellerSlug={seller.slug} businessName={seller.businessName} following={following} signedIn returnPath={returnPath} size="sm" />
          <span className="text-xs text-ink-500">Posted {timeAgo(seller.lastPostedAt)}</span>
        </div>
      </div>
    </li>
  );
}
