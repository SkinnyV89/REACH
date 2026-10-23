"use client";

import Link from "next/link";
import { useActionState } from "react";
import { setFollowAction, type FollowState } from "@/app/follow-actions";

// Follow / Following toggle. Works without JavaScript (a plain form posting
// to a server action). Signed-out visitors get a link to sign in instead.
export function FollowButton({
  sellerSlug,
  businessName,
  following: initial,
  signedIn,
  returnPath,
  size = "md",
}: {
  sellerSlug: string;
  businessName: string;
  following: boolean;
  signedIn: boolean;
  returnPath: string;
  size?: "sm" | "md";
}) {
  const [state, run, pending] = useActionState(
    async (prev: FollowState): Promise<FollowState> => setFollowAction(sellerSlug, returnPath, !(prev.following ?? initial)),
    {},
  );
  const following = state.following ?? initial;
  const base = `inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition disabled:opacity-60 ${
    size === "sm" ? "px-3 py-1 text-sm" : "px-4 py-2 text-sm"
  }`;

  if (!signedIn) {
    return (
      <Link href={`/sign-in?next=${encodeURIComponent(returnPath)}`} className={`${base} bg-brand-600 text-white hover:bg-brand-700`}>
        Follow
      </Link>
    );
  }
  return (
    <form action={run} className="inline-flex flex-col items-start gap-1">
      <button
        type="submit"
        disabled={pending}
        aria-pressed={following}
        aria-label={following ? `Following ${businessName}. Tap to unfollow.` : `Follow ${businessName}`}
        className={`${base} ${following ? "border border-ink-300 bg-white text-ink-900 hover:bg-ink-100" : "bg-brand-600 text-white hover:bg-brand-700"}`}
      >
        {following ? (
          <>
            <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth={2.5}>
              <path d="m5 12 5 5L20 7" />
            </svg>
            Following
          </>
        ) : (
          "Follow"
        )}
      </button>
      {state.error && <span className="text-xs text-red-600">{state.error}</span>}
    </form>
  );
}
