"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/lib/auth-rules";
import { FollowError, follow, unfollow } from "@/lib/follows";
import { getSession } from "@/lib/session";

export type FollowState = { following?: boolean; error?: string };

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Follow or unfollow a storefront. Signed-out visitors are sent to sign in and
// brought back to the same page; they tap Follow again there (a follow is
// never made just by opening a link).
export async function setFollowAction(sellerSlug: string, returnPath: string, want: boolean): Promise<FollowState> {
  const back = safeNextPath(returnPath) ?? `/s/${sellerSlug}`;
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(back)}`);
  if (!SLUG_RE.test(sellerSlug) || sellerSlug.length > 60 || typeof want !== "boolean") return { error: "Something went wrong. Please try again." };
  try {
    if (want) await follow(session.user.id, sellerSlug);
    else await unfollow(session.user.id, sellerSlug);
  } catch (error) {
    if (error instanceof FollowError) return { error: error.message, following: !want };
    console.error("[follow] failed:", error instanceof Error ? error.name : typeof error);
    return { error: "Something went wrong. Please try again.", following: !want };
  }
  revalidatePath(`/s/${sellerSlug}`, "layout");
  revalidatePath("/feed");
  revalidatePath("/following");
  return { following: want };
}
