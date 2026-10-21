import { z } from "zod";
import { CODE_ALPHABET, SHARE_CODE_LENGTH } from "@/lib/campaign-rules";

// Rules for storefronts and listing availability. Pure functions, shared by
// the seller editor, the public pages and the server actions.

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export const LAYOUTS = [
  { value: "PORTFOLIO", label: "Portfolio", hint: "For skills and services: hair, beauty, barbers" },
  { value: "PRODUCT_GRID", label: "Product grid", hint: "For things you sell" },
  { value: "MENU", label: "Menu", hint: "For food and baking" },
] as const;
export type LayoutValue = (typeof LAYOUTS)[number]["value"];

const PORTFOLIO_CATEGORIES = ["hair-wigs-weaves", "beauty-personal-care", "barbers-mens-grooming", "services"];

// Default layout from what the seller sells. Food wins over services, which
// wins over goods. The seller can change it.
export function layoutForCategories(categorySlugs: string[]): LayoutValue {
  if (categorySlugs.includes("food-baking-catering")) return "MENU";
  if (categorySlugs.some((s) => PORTFOLIO_CATEGORIES.includes(s))) return "PORTFOLIO";
  return "PRODUCT_GRID";
}

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

export const AVAILABILITY = {
  IN_STOCK: { label: "In stock", className: "bg-brand-100 text-brand-700" },
  PRE_ORDER: { label: "Pre-order", className: "bg-sky-100 text-sky-800" },
  MADE_TO_ORDER: { label: "Made to order", className: "bg-violet-100 text-violet-800" },
  BY_BOOKING: { label: "By booking", className: "bg-brand-100 text-brand-700" },
  OUT_OF_STOCK: { label: "Out of stock", className: "bg-ink-100 text-ink-500" },
} as const;
export type AvailabilityValue = keyof typeof AVAILABILITY;

// Which availability options make sense for each kind of listing.
export const AVAILABILITY_FOR_KIND: Record<"PRODUCT" | "SERVICE", AvailabilityValue[]> = {
  PRODUCT: ["IN_STOCK", "PRE_ORDER", "MADE_TO_ORDER", "OUT_OF_STOCK"],
  SERVICE: ["BY_BOOKING", "OUT_OF_STOCK"],
};

export function availabilityLabel(value: AvailabilityValue, kind: "PRODUCT" | "SERVICE"): string {
  if (kind === "SERVICE" && value === "OUT_OF_STOCK") return "Not taking bookings";
  return AVAILABILITY[value].label;
}

export function defaultAvailability(kind: "PRODUCT" | "SERVICE"): AvailabilityValue {
  return kind === "SERVICE" ? "BY_BOOKING" : "IN_STOCK";
}

export function needsLeadTime(value: AvailabilityValue): boolean {
  return value === "PRE_ORDER" || value === "MADE_TO_ORDER";
}

// The older status column mirrors availability so earlier code (campaign
// pages) keeps behaving. Archiving is separate and never set from here.
export function statusFromAvailability(value: AvailabilityValue): "AVAILABLE" | "UNAVAILABLE" {
  return value === "OUT_OF_STOCK" ? "UNAVAILABLE" : "AVAILABLE";
}

// "updated today" / "updated 3 days ago" / "updated 2 months ago".
export function formatUpdated(at: Date, now = new Date()): string {
  const days = Math.floor((now.getTime() - at.getTime()) / 86_400_000);
  if (days <= 0) return "updated today";
  if (days === 1) return "updated yesterday";
  if (days < 30) return `updated ${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `updated ${months} ${months === 1 ? "month" : "months"} ago`;
  return "updated over a year ago";
}

// ---------------------------------------------------------------------------
// Item slugs
// ---------------------------------------------------------------------------

// Paths that may later live under /s/<seller>/ and so can't be item slugs.
const RESERVED_ITEM_SLUGS = new Set(["posts", "reviews", "book", "booking", "live", "about", "follow", "share"]);
export const ITEM_SLUG_MAX = 60;

// "Crème brûlée & tart!!" -> "creme-brulee-tart". Never empty or reserved.
export function itemSlug(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, ITEM_SLUG_MAX)
    .replace(/-+$/g, "");
  if (!base) return "item";
  return RESERVED_ITEM_SLUGS.has(base) ? `${base}-item` : base;
}

export function itemSlugCandidates(base: string, count = 50): string[] {
  const out = [base];
  for (let n = 2; n < count + 2; n++) {
    const suffix = `-${n}`;
    out.push(`${base.slice(0, ITEM_SLUG_MAX - suffix.length).replace(/-+$/g, "")}${suffix}`);
  }
  return out;
}

export const ITEM_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ---------------------------------------------------------------------------
// Campaign codes on storefront links (?c=<code>)
// ---------------------------------------------------------------------------

const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${SHARE_CODE_LENGTH}}$`);

export function parseCampaignCode(raw: string | string[] | null | undefined): string | null {
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  return CODE_RE.test(value) ? value : null;
}

// The share code is the last segment of a seller campaign's uniqueLink.
export function shareCodeOf(uniqueLink: string): string {
  return uniqueLink.slice(-SHARE_CODE_LENGTH);
}

// ---------------------------------------------------------------------------
// Area and service wording
// ---------------------------------------------------------------------------

const PROVINCE_LABELS: Record<string, string> = {
  EASTERN_CAPE: "Eastern Cape",
  FREE_STATE: "Free State",
  GAUTENG: "Gauteng",
  KWAZULU_NATAL: "KwaZulu-Natal",
  LIMPOPO: "Limpopo",
  MPUMALANGA: "Mpumalanga",
  NORTH_WEST: "North West",
  NORTHERN_CAPE: "Northern Cape",
  WESTERN_CAPE: "Western Cape",
};

// "Pimville, Soweto" when a place is chosen; otherwise the seller's older
// free-text location and province. Never a street address.
export function formatArea(a: {
  areaDetail?: string | null;
  placeName?: string | null;
  location?: string | null;
  province?: string | null;
}): string | null {
  if (a.placeName) {
    const detail = a.areaDetail?.trim();
    return detail && detail.toLowerCase() !== a.placeName.toLowerCase() ? `${detail}, ${a.placeName}` : a.placeName;
  }
  const parts = [a.location?.trim(), a.province ? PROVINCE_LABELS[a.province] : null].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

export function provinceName(value: string): string {
  return PROVINCE_LABELS[value] ?? value;
}

// How customers get the product or service, in wording that fits the layout.
export function serviceModeLines(
  fulfilment: string[],
  layout: LayoutValue,
  radiusKm: number | null | undefined,
): string[] {
  const services = layout === "PORTFOLIO";
  const radius = radiusKm ? ` within ${radiusKm} km` : "";
  const lines: string[] = [];
  if (fulfilment.includes("DELIVERY")) lines.push(services ? `Comes to you${radius}` : `Delivers${radius}`);
  if (fulfilment.includes("COLLECTION")) lines.push(services ? "Visit them" : "Collection available");
  if (fulfilment.includes("ONLINE")) lines.push("Online or remote");
  return lines;
}

// ---------------------------------------------------------------------------
// Editor schema and publishing
// ---------------------------------------------------------------------------

const optional = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((v) => (v === "" ? null : v));

export const storefrontSchema = z.object({
  tagline: optional(80, "Keep your tagline under 80 characters."),
  description: optional(500, "Keep this under 500 characters."),
  placeId: z.string().uuid("Choose your town or city."),
  areaDetail: optional(60, "Keep this under 60 characters."),
  serviceRadiusKm: z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return null;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 200) {
        ctx.addIssue({ code: "custom", message: "Enter a distance between 1 and 200 km." });
        return z.NEVER;
      }
      return n;
    }),
  layout: z.enum(["PORTFOLIO", "PRODUCT_GRID", "MENU"], { message: "Choose a layout." }),
});
export type StorefrontInput = z.output<typeof storefrontSchema>;

export type PublishCheck = { ok: boolean; missing: string[] };

// What a storefront needs before the public can see it.
export function publishCheck(s: { hasLocation: boolean; listingCount: number; hasWhatsapp: boolean }): PublishCheck {
  const missing: string[] = [];
  if (!s.hasLocation) missing.push("Choose your town or city.");
  if (s.listingCount === 0) missing.push("Add at least one product or service.");
  if (!s.hasWhatsapp) missing.push("Add a WhatsApp number to your business profile.");
  return { ok: missing.length === 0, missing };
}
