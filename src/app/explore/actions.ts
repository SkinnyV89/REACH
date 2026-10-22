"use server";

import { cookies } from "next/headers";
import { roundCoordinate } from "@/lib/explore-rules";
import { placeBySlug, saveBuyerPlace, snapToPlace } from "@/lib/explore";
import { getSession } from "@/lib/session";
import { NEAR_COOKIE } from "./near";

export type NearResult = { slug?: string; name?: string; error?: string };

const YEAR = 60 * 60 * 24 * 365;

// Remembers the buyer's town: on the account when signed in, otherwise in a
// first-party cookie. Only the town is ever stored.
async function remember(place: { id: string; slug: string }) {
  (await cookies()).set(NEAR_COOKIE, place.slug, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: YEAR, path: "/" });
  const session = await getSession();
  if (session) await saveBuyerPlace(session.user.id, place.id);
}

export async function chooseTownAction(slug: string): Promise<NearResult> {
  const place = await placeBySlug(slug);
  if (!place) return { error: "Choose a town from the list." };
  await remember(place);
  return { slug: place.slug, name: place.name };
}

// "Use my location": the browser has already rounded the coordinates to about
// 1 km; they're rounded again here, matched to the nearest town and dropped.
export async function locateMeAction(latitude: number, longitude: number): Promise<NearResult> {
  if (![latitude, longitude].every((n) => typeof n === "number" && Number.isFinite(n)) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    return { error: "We couldn't read your location." };
  }
  const place = await snapToPlace({ latitude: roundCoordinate(latitude), longitude: roundCoordinate(longitude) });
  if (!place) return { error: "We couldn't find a town near you on REACH yet. Choose one from the list." };
  await remember(place);
  return { slug: place.slug, name: place.name };
}
