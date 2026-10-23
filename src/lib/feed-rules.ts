import { POST_CODE_RE } from "@/lib/post-rules";

// Feed and following rules shared by the browser and the server. Pure.

export const FEED_PAGE_SIZE = 20;
export const MAX_FOLLOWS = 1000;
export const FOLLOW_CHANGES_PER_HOUR = 120;
// Below this, storefronts don't show a follower count (sellers always see theirs).
export const PUBLIC_FOLLOWER_THRESHOLD = 10;
export const RECENTLY_ACTIVE_DAYS = 30;

// "12 followers" from 10 up; nothing below, so a new storefront doesn't look empty.
export function publicFollowerLabel(count: number): string | null {
  if (count < PUBLIC_FOLLOWER_THRESHOLD) return null;
  return `${String(count).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} followers`;
}

// Feed cursor: the last post's publish time and public code, so paging never
// skips or repeats posts even when several share a timestamp, and URLs never
// carry internal ids.
export type FeedCursor = { publishedAt: Date; code: string };

export function encodeCursor(c: FeedCursor): string {
  return `${c.publishedAt.getTime().toString(36)}.${c.code}`;
}

export function decodeCursor(raw: unknown): FeedCursor | null {
  if (typeof raw !== "string" || raw.length > 40) return null;
  const [time, code, extra] = raw.split(".");
  const ms = Number.parseInt(time ?? "", 36);
  if (extra !== undefined || !Number.isFinite(ms) || ms <= 0 || !code || !POST_CODE_RE.test(code)) return null;
  return { publishedAt: new Date(ms), code };
}

// Discovery filters for the launch categories.
export const DISCOVERY_FILTERS = [
  { key: "hair-beauty", label: "Hair & Beauty", categories: ["hair-wigs-weaves", "beauty-personal-care", "skincare", "cosmetics"] },
  { key: "barbers", label: "Barbers", categories: ["barbers-mens-grooming"] },
  { key: "food", label: "Food & Baking", categories: ["food-baking-catering"] },
] as const;

export type DiscoveryFilterKey = (typeof DISCOVERY_FILTERS)[number]["key"];

export function parseDiscoveryFilter(raw: unknown): (typeof DISCOVERY_FILTERS)[number] | null {
  return DISCOVERY_FILTERS.find((f) => f.key === raw) ?? null;
}

// "Thandi Braids shared a new post" / "… shared 3 new posts".
export function newPostsMessage(businessName: string, count: number): string {
  return count === 1 ? `${businessName} shared a new post` : `${businessName} shared ${count} new posts`;
}

const ago = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

// "just now", "5 minutes ago", "yesterday", "3 days ago", then a date.
export function timeAgo(date: Date, now = new Date()): string {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 60) return "just now";
  if (abs < 3600) return ago.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return ago.format(Math.round(seconds / 3600), "hour");
  if (abs < 7 * 86400) return ago.format(Math.round(seconds / 86400), "day");
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Johannesburg" }).format(date);
}
