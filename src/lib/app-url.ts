import "server-only";
import { shareCodeOf } from "@/lib/storefront-rules";

// Public base URL used to build share links. Reuses BETTER_AUTH_URL, which
// must already be the app's public address, so there is one setting to keep right.
export function appUrl(): string {
  return (process.env.APP_URL || process.env.BETTER_AUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export function shareUrl(uniqueLink: string): string {
  return `${appUrl()}/c/${uniqueLink}`;
}

// A campaign's public link: its own /c/ page for older campaigns, or the
// seller's storefront with ?c=<code> for newer ones.
export function campaignShareUrl(
  campaign: { uniqueLink: string; destination: "CAMPAIGN_PAGE" | "STOREFRONT" },
  sellerSlug: string,
): string {
  if (campaign.destination === "CAMPAIGN_PAGE") return shareUrl(campaign.uniqueLink);
  return `${appUrl()}/s/${sellerSlug}?c=${shareCodeOf(campaign.uniqueLink)}`;
}

// Adds ?src= (or &src=) for per-channel share links.
export function withSrc(url: string, src: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}src=${encodeURIComponent(src)}`;
}

// Absolute form of a stored file's URL (Blob URLs already are; local
// development files are served from this app).
export function absoluteUrl(url: string): string {
  return /^https?:\/\//.test(url) ? url : `${appUrl()}${url}`;
}
