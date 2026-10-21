import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth, type Session } from "@/lib/auth";
import { db } from "@/lib/db";
import type { Seller } from "@/generated/prisma/client";

export const SIGN_IN_PATH = "/sign-in";
// Where a signed-in user without a finished business profile is sent.
export const SELLER_SETUP_PATH = "/onboarding";

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
// with the returned seller.id. Sellers who have not finished onboarding are
// sent back to it, so seller pages can rely on a complete profile.
export async function requireSeller(): Promise<{ session: Session; seller: Seller }> {
  const session = await requireSession();
  const seller = await getCurrentSeller();
  if (!seller || seller.status !== "ACTIVE") redirect(SELLER_SETUP_PATH);
  return { session, seller };
}

// For admin-only server actions and pages. Non-admins get a 404 rather than
// a hint that the admin area exists.
export async function requireAdmin(): Promise<Session> {
  const session = await requireSession();
  if (session.user.role !== "ADMIN") notFound();
  return session;
}
