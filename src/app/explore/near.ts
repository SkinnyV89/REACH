import "server-only";
import { cookies } from "next/headers";
import { placeById, placeBySlug, type ExplorePlace } from "@/lib/explore";
import { getSession } from "@/lib/session";
import { db } from "@/lib/db";

export const NEAR_COOKIE = "reach_near";

// The town to explore near: the URL's ?near= first (so links are shareable),
// then the town saved on the account, then the cookie. Reading never saves.
export async function resolveNear(fromUrl: unknown): Promise<{ place: ExplorePlace | null; source: "url" | "saved" | null }> {
  const inUrl = await placeBySlug(fromUrl);
  if (inUrl) return { place: inUrl, source: "url" };
  const session = await getSession();
  if (session) {
    const user = await db.user.findUnique({ where: { id: session.user.id }, select: { placeId: true } });
    const saved = await placeById(user?.placeId);
    if (saved) return { place: saved, source: "saved" };
  }
  const cookie = await placeBySlug((await cookies()).get(NEAR_COOKIE)?.value);
  return { place: cookie, source: cookie ? "saved" : null };
}
