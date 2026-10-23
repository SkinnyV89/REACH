import type { Metadata } from "next";
import Link from "next/link";
import { BuyerHeader } from "@/components/buyer-header";
import { FollowButton } from "@/components/follow-button";
import { listFollowing } from "@/lib/follows";
import { requireSession } from "@/lib/session";
import { formatArea } from "@/lib/storefront-rules";
import { SellerAvatar } from "../feed/feed-parts";

export const metadata: Metadata = { title: "Following · REACH" };

export default async function FollowingPage() {
  const session = await requireSession();
  const sellers = await listFollowing(session.user.id);

  return (
    <div className="min-h-screen bg-ink-100">
      <BuyerHeader userId={session.user.id} current="following" />
      <main className="mx-auto max-w-xl space-y-4 px-4 py-6">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Following</h1>
          <p className="mt-1 text-sm text-ink-500">Only you can see this list. Sellers see how many people follow them, never who.</p>
        </div>
        {sellers.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ink-300 bg-white px-6 py-10 text-center">
            <p className="text-ink-700">You&apos;re not following anyone yet.</p>
            <Link href="/feed#discover" className="mt-4 inline-block rounded-lg bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700">
              Find sellers to follow
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-300/60 bg-white">
            {sellers.map((s) => {
              const area = formatArea(s.area);
              return (
                <li key={s.slug} className="flex items-center gap-3 p-3">
                  <SellerAvatar name={s.businessName} logo={s.logo} className="h-12 w-12" />
                  <div className="min-w-0 flex-1">
                    {s.available ? (
                      <Link href={`/s/${s.slug}`} className="block truncate font-semibold text-ink-900 hover:underline">
                        {s.businessName}
                      </Link>
                    ) : (
                      <span className="block truncate font-semibold text-ink-700">{s.businessName}</span>
                    )}
                    <p className="truncate text-xs text-ink-500">{s.available ? (area ?? s.tagline ?? "") : "Storefront not available right now"}</p>
                  </div>
                  <FollowButton sellerSlug={s.slug} businessName={s.businessName} following signedIn returnPath="/following" size="sm" />
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
