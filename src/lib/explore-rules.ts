// Explore ranking and location rules. Pure and shared: no database access.
//
// Ranking is an explainable weighted score over signals REACH can verify.
// Nothing here can be bought, and popularity (followers, enquiries) is left
// out on purpose: it favours whoever is already ahead, invites fake follows
// and buries new sellers.

export const WEIGHTS = { near: 0.4, fresh: 0.3, complete: 0.2, isNew: 0.1 } as const;
export const FRESH_HALF_LIFE_DAYS = 14;
export const NEW_FULL_DAYS = 14; // full boost while this new
export const NEW_FADE_DAYS = 14; // then fades to zero over this long
export const NEAR_RADIUS_KM = 25; // "Near <town>"; beyond is "Further away"
export const MIN_NEAR_RESULTS = 6;
export const EXPLORE_PAGE_SIZE = 20;
export const WORK_PAGE_SIZE = 24;
// Sellers whose scores are this close are treated as equal and rotate daily.
export const TIE_BUCKET = 0.05;
export const MAX_SNAP_KM = 100; // "Use my location" outside this from any town: no match

export const RANKING_NOTE = "Sorted by distance, recent activity and complete storefronts.";
export const PAID_PLACEMENT_PROMISE = "Rankings can't be bought. Any paid placement will be labelled Sponsored.";

const DAY_MS = 86_400_000;

// ---------------------------------------------------------------------------
// Distance
// ---------------------------------------------------------------------------

export type LatLng = { latitude: number; longitude: number };

// Great-circle distance in km between two points (town centres).
export function distanceKm(a: LatLng, b: LatLng): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// "Use my location": the browser rounds coordinates to two decimals
// (about 1 km) before sending them, and the server keeps only the town.
export function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

export function nearestPlace<T extends LatLng>(point: LatLng, places: T[]): (T & { km: number }) | null {
  let best: (T & { km: number }) | null = null;
  for (const p of places) {
    const km = distanceKm(point, p);
    if (!best || km < best.km) best = { ...p, km };
  }
  return best && best.km <= MAX_SNAP_KM ? best : null;
}

// Distances are between town centres, so they're rounded and marked "about".
export function distanceLabel(km: number, sameTown: boolean, sellerTown: string): string {
  if (sameTown) return `In ${sellerTown}`;
  if (km < 5) return `${sellerTown} · nearby`;
  return `${sellerTown} · about ${km < 20 ? Math.round(km) : Math.round(km / 5) * 5} km away`;
}

// ---------------------------------------------------------------------------
// Signals (each 0..1)
// ---------------------------------------------------------------------------

export function nearSignal(km: number, sameTown: boolean, deliversToBuyer: boolean): number {
  let s = sameTown ? 1 : km <= 10 ? 0.8 : km <= 25 ? 0.6 : km <= 60 ? 0.3 : 0.1;
  if (deliversToBuyer) s = Math.max(s, 0.8);
  return s;
}

// Whole days since the last real activity (a post, or an availability
// update), halving every 14 days. Counted in whole days, so posting many
// times a day earns nothing more than posting once.
export function freshSignal(lastActivity: Date | null, now: Date): number {
  if (!lastActivity) return 0;
  const days = Math.max(0, Math.floor((now.getTime() - lastActivity.getTime()) / DAY_MS));
  return 0.5 ** (days / FRESH_HALF_LIFE_DAYS);
}

export type CompletenessInput = {
  listings: number;
  listingsWithPhoto: number;
  listingsWithPrice: number;
  posts: number;
  hasLogoOrCover: boolean;
  hasDescription: boolean;
};

export const COMPLETENESS_CHECKS = [
  ["Photos on most listings", (c: CompletenessInput) => c.listings > 0 && c.listingsWithPhoto * 2 >= c.listings],
  ["Prices shown", (c: CompletenessInput) => c.listings > 0 && c.listingsWithPrice * 2 >= c.listings],
  ["At least one post", (c: CompletenessInput) => c.posts > 0],
  ["Logo or cover photo", (c: CompletenessInput) => c.hasLogoOrCover],
  ["About text", (c: CompletenessInput) => c.hasDescription],
] as const;

export function completeSignal(c: CompletenessInput): number {
  return COMPLETENESS_CHECKS.filter(([, ok]) => ok(c)).length / COMPLETENESS_CHECKS.length;
}

// Full for the first 14 days after publishing, then fading to zero over the
// next 14: new sellers get seen while they build up.
export function newSignal(publishedAt: Date, now: Date): number {
  const days = (now.getTime() - publishedAt.getTime()) / DAY_MS;
  if (days <= NEW_FULL_DAYS) return 1;
  return Math.max(0, 1 - (days - NEW_FULL_DAYS) / NEW_FADE_DAYS);
}

export type Signals = { near: number | null; fresh: number; complete: number; isNew: number };

// Weighted score. Without a buyer location, the near weight is shared out
// in proportion among the other signals.
export function scoreSignals(s: Signals): number {
  if (s.near === null) {
    const rest = WEIGHTS.fresh + WEIGHTS.complete + WEIGHTS.isNew;
    return (WEIGHTS.fresh * s.fresh + WEIGHTS.complete * s.complete + WEIGHTS.isNew * s.isNew) / rest;
  }
  return WEIGHTS.near * s.near + WEIGHTS.fresh * s.fresh + WEIGHTS.complete * s.complete + WEIGHTS.isNew * s.isNew;
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

// Deterministic 0..1 hash (FNV-1a), for the daily rotation of equal sellers.
export function hashUnit(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0x1_0000_0000;
}

// The day in South Africa, e.g. "2026-10-22": the rotation changes daily but
// stays put across refreshes and pages.
export function rotationDay(now: Date): string {
  return new Date(now.getTime() + 2 * 3600_000).toISOString().slice(0, 10);
}

// Highest score first; scores within the same 0.05 band count as equal and
// are ordered by a hash of (day, id), so equal sellers take turns at the top.
export function rankByScore<T extends { id: string; score: number }>(items: T[], day: string): T[] {
  const bucket = (x: number) => Math.round(x / TIE_BUCKET);
  return [...items].sort((a, b) => bucket(b.score) - bucket(a.score) || hashUnit(`${day}:${a.id}`) - hashUnit(`${day}:${b.id}`));
}

// Keeps the order, but never more than `maxRun` in a row with the same key
// (e.g. category), pulling the next different one forward when needed.
export function diversify<T>(items: T[], key: (t: T) => string, maxRun = 2): T[] {
  const rest = [...items];
  const out: T[] = [];
  while (rest.length) {
    const lastKeys = out.slice(-maxRun).map(key);
    const blocked = lastKeys.length === maxRun && lastKeys.every((k) => k === lastKeys[0]) ? lastKeys[0] : null;
    const i = blocked === null ? 0 : rest.findIndex((t) => key(t) !== blocked);
    out.push(...rest.splice(i === -1 ? 0 : i, 1));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Explanations shown on each card
// ---------------------------------------------------------------------------

export function daysAgoLabel(date: Date, now: Date): string {
  const days = Math.floor((now.getTime() - date.getTime()) / DAY_MS);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

export function reasonChips(r: {
  distance: string | null;
  deliversToBuyer: boolean;
  lastPostAt: Date | null;
  isNew: boolean;
  now: Date;
}): string[] {
  const chips: string[] = [];
  if (r.distance) chips.push(r.distance);
  if (r.deliversToBuyer) chips.push("Delivers to your area");
  if (r.lastPostAt && r.now.getTime() - r.lastPostAt.getTime() <= 30 * DAY_MS) chips.push(`Posted ${daysAgoLabel(r.lastPostAt, r.now)}`);
  if (r.isNew) chips.push("New on REACH");
  return chips;
}

// ---------------------------------------------------------------------------
// Search query
// ---------------------------------------------------------------------------

export function normaliseQuery(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const q = raw.normalize("NFKC").replace(/\s+/g, " ").trim().slice(0, 60);
  return q.length >= 2 ? q : null;
}

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

export type ExploreParams = { near?: string | null; cat?: string | null; q?: string | null; tab?: "sellers" | "work"; open?: boolean; page?: number };

// Links within Explore. A town + category with nothing else uses the
// search-engine landing page (/explore/<category>/<town>); everything else is
// a query on /explore. Links into storefronts carry ?src=reach separately.
export function exploreHref(p: ExploreParams): string {
  const tab = p.tab ?? "sellers";
  const page = p.page && p.page > 1 ? p.page : 1;
  if (p.near && p.cat && !p.q && !p.open && tab === "sellers" && page === 1) return `/explore/${p.cat}/${p.near}`;
  const q = new URLSearchParams();
  if (p.near) q.set("near", p.near);
  if (p.cat) q.set("cat", p.cat);
  if (p.q) q.set("q", p.q);
  if (tab === "work") q.set("tab", "work");
  if (p.open && tab === "sellers") q.set("open", "1");
  if (page > 1) q.set("page", String(page));
  const s = q.toString();
  return s ? `/explore?${s}` : "/explore";
}

export function parsePage(raw: unknown): number {
  const n = Number.parseInt(typeof raw === "string" ? raw : "", 10);
  return Number.isFinite(n) && n >= 1 && n <= 500 ? n : 1;
}
