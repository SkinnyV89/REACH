import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, type Session } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Seller } from "@/generated/prisma/client";

export const SIGN_IN_PATH = "/sign-in";
// Until seller onboarding (Phase 2.2) exists, the dashboard is where a signed-in
// user without a business profile is told to set one up.
export const SELLER_SETUP_PATH = "/dashboard";

// Reads the session from the request cookies. Cached per request so several
// server components can call it without repeated database lookups.
export const getSession = cache(async (): Promise<Session | null> => {
  return auth.api.getSession({ headers: await headers() });
});

// Use at the top of every protected page, server action and route handler.
// Never trust a user id sent from the browser; take it from this session.
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(SIGN_IN_PATH);
  return session;
}

// The signed-in user's own seller profile, or null if not set up yet.
// Looked up by the session's user id only, so it can never return another
// seller's record.
export const getCurrentSeller = cache(async (): Promise<Seller | null> => {
  const session = await getSession();
  if (!session) return null;
  return db.seller.findUnique({ where: { userId: session.user.id } });
});

// Use wherever seller data is read or written. Scope every seller-owned query
// with the returned seller.id.
export async function requireSeller(): Promise<{ session: Session; seller: Seller }> {
  const session = await requireSession();
  const seller = await getCurrentSeller();
  if (!seller) redirect(SELLER_SETUP_PATH);
  return { session, seller };
}
