import Link from "next/link";
import { UnreadBadge } from "@/components/buyer-header";
import { unreadCount } from "@/lib/notifications";
import { getSession } from "@/lib/session";

// Slim bar on public pages (storefronts, items, posts): a way back to the
// feed for signed-in people, and to sign in for everyone else.
export async function PublicTopBar({ next }: { next: string }) {
  const session = await getSession();
  const unread = session ? await unreadCount(session.user.id) : 0;
  return (
    <div className="border-b border-ink-300/60 bg-white">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-2">
        <Link href={session ? "/feed" : "/"} className="text-lg font-extrabold tracking-tight text-brand-700">
          REACH
        </Link>
        {session ? (
          <nav aria-label="Account" className="flex items-center gap-4 text-sm font-medium">
            <Link href="/explore" className="text-ink-700 hover:text-ink-900">
              Explore
            </Link>
            <Link href="/feed" className="text-ink-700 hover:text-ink-900">
              Feed
            </Link>
            <Link href="/notifications" className="inline-flex items-center text-ink-700 hover:text-ink-900">
              Notifications
              {unread > 0 && <UnreadBadge count={unread} />}
            </Link>
          </nav>
        ) : (
          <nav aria-label="Account" className="flex items-center gap-4 text-sm font-medium">
            <Link href="/explore" className="text-ink-700 hover:text-ink-900">
              Explore
            </Link>
            <Link href={`/sign-in?next=${encodeURIComponent(next)}`} className="font-semibold text-brand-700 hover:underline">
              Sign in
            </Link>
          </nav>
        )}
      </div>
    </div>
  );
}
