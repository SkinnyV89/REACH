import type { Metadata } from "next";
import Link from "next/link";
import { BuyerHeader } from "@/components/buyer-header";
import { Photo } from "@/components/photo";
import { newPostsMessage, timeAgo } from "@/lib/feed-rules";
import { listNotifications } from "@/lib/notifications";
import { requireSession } from "@/lib/session";
import { SellerAvatar } from "../feed/feed-parts";
import { MarkRead } from "./mark-read";

export const metadata: Metadata = { title: "Notifications · REACH" };

export default async function NotificationsPage() {
  const session = await requireSession();
  const items = await listNotifications(session.user.id);
  const anyUnread = items.some((n) => n.unread);

  return (
    <div className="min-h-screen bg-ink-100">
      <BuyerHeader userId={session.user.id} current="notifications" />
      {anyUnread && <MarkRead />}
      <main className="mx-auto max-w-xl space-y-4 px-4 py-6">
        <h1 className="text-2xl font-bold text-ink-900">Notifications</h1>
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ink-300 bg-white px-6 py-10 text-center">
            <p className="text-ink-700">No notifications yet. When sellers you follow post, you&apos;ll see it here.</p>
          </div>
        ) : (
          <ul className="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-300/60 bg-white">
            {items.map((n) => (
              <li key={n.id} className={n.unread ? "bg-sky-50" : undefined}>
                <Link href={n.href} className="flex items-center gap-3 p-3 hover:bg-ink-100/60">
                  <SellerAvatar name={n.seller.businessName} logo={n.seller.logo} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-ink-900">
                      {n.unread && <span className="sr-only">New: </span>}
                      {newPostsMessage(n.seller.businessName, n.count)}
                    </span>
                    <span className="text-xs text-ink-500">{timeAgo(n.updatedAt)}</span>
                  </span>
                  {n.photo && <Photo photo={n.photo} alt="" sizes="48px" className="h-12 w-12 shrink-0 rounded-lg object-cover" />}
                  {n.unread && <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full bg-sky-600" />}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
