import { z } from "zod";
import { AVAILABILITY_FOR_KIND, needsLeadTime, type AvailabilityValue } from "@/lib/storefront-rules";

// Validation and formatting for products and services. Shared by the form
// (instant feedback) and the server actions (the real enforcement point).

export const PRODUCT_KINDS = [
  { value: "PRODUCT", label: "Product", hint: "Something you sell, e.g. a wig or a cake" },
  { value: "SERVICE", label: "Service", hint: "Something you do, e.g. braiding or catering" },
] as const;

export const PRICE_TYPES = [
  { value: "FIXED", label: "Fixed price" },
  { value: "FROM", label: "Starting from" },
  { value: "ON_REQUEST", label: "Price on request" },
] as const;

export const PRODUCT_STATUSES = {
  AVAILABLE: { label: "Available", className: "bg-brand-100 text-brand-700" },
  UNAVAILABLE: { label: "Unavailable", className: "bg-amber-100 text-amber-800" },
  ARCHIVED: { label: "Archived", className: "bg-ink-100 text-ink-500" },
} as const;

export const MAX_PRICE = 1_000_000;
// Keeps a single account from flooding the catalogue; generous for side hustles.
export const MAX_PRODUCTS_PER_SELLER = 200;

// Parses the ways people type rand amounts: "250", "R250", "R 1 250",
// "1,250.50", "1250,50". Returns a string with two decimals ("1250.50"),
// suitable for a Decimal column, or null if it is not a valid amount.
export function parsePrice(raw: string): string | null {
  let v = raw.trim().replace(/^r\s*/i, "").replace(/[\s ]/g, "");
  if (!v) return null;

  const hasComma = v.includes(",");
  const hasDot = v.includes(".");
  if (hasComma && hasDot) {
    v = v.replace(/,/g, ""); // "1,250.50": commas are thousands separators
  } else if (hasComma) {
    // "1250,50" uses a decimal comma; "1,250" uses a thousands comma.
    v = /,\d{1,2}$/.test(v) ? v.replace(",", ".") : v.replace(/,/g, "");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(v)) return null;

  const amount = Number(v);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_PRICE) return null;
  return amount.toFixed(2);
}

// "1250.00" -> "R1 250"; "99.5" -> "R99.50". South African formatting.
export function formatRand(amount: string | number): string {
  const n = Number(amount);
  const hasCents = Math.round(n * 100) % 100 !== 0;
  const formatted = n
    .toFixed(hasCents ? 2 : 0)
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `R${formatted}`;
}

export function formatPrice(priceType: string, price: string | null): string {
  if (priceType === "ON_REQUEST" || price === null) return "Price on request";
  return priceType === "FROM" ? `From ${formatRand(price)}` : formatRand(price);
}

export const productSchema = z
  .object({
    kind: z.enum(["PRODUCT", "SERVICE"], { message: "Choose product or service." }),
    name: z.string().trim().min(2, "Give it a name customers will recognise.").max(100, "Keep the name under 100 characters."),
    categoryId: z.string().uuid("Choose a category."),
    description: z
      .string()
      .trim()
      .max(1000, "Keep the description under 1000 characters.")
      .transform((v) => (v === "" ? null : v)),
    priceType: z.enum(["FIXED", "FROM", "ON_REQUEST"], { message: "Choose how you price this." }),
    price: z.string().trim(),
    availability: z.enum(["IN_STOCK", "PRE_ORDER", "MADE_TO_ORDER", "OUT_OF_STOCK", "BY_BOOKING"], {
      message: "Choose whether this is available.",
    }),
    leadTimeDays: z.string().trim().optional().default(""),
  })
  .transform((input, ctx) => {
    if (!(AVAILABILITY_FOR_KIND[input.kind] as AvailabilityValue[]).includes(input.availability)) {
      ctx.addIssue({
        code: "custom",
        path: ["availability"],
        message: input.kind === "SERVICE" ? "Services are by booking or not taking bookings." : "Choose an option that fits a product.",
      });
      return z.NEVER;
    }
    let leadTimeDays: number | null = null;
    if (needsLeadTime(input.availability) && input.leadTimeDays !== "") {
      const n = Number(input.leadTimeDays);
      if (!Number.isInteger(n) || n < 1 || n > 180) {
        ctx.addIssue({ code: "custom", path: ["leadTimeDays"], message: "Enter a number of days between 1 and 180." });
        return z.NEVER;
      }
      leadTimeDays = n;
    }
    const base = { ...input, leadTimeDays };
    if (input.priceType === "ON_REQUEST") return { ...base, price: null };
    const price = parsePrice(input.price);
    if (!price) {
      ctx.addIssue({
        code: "custom",
        path: ["price"],
        message: input.price
          ? `Enter an amount in rand between R1 and ${formatRand(MAX_PRICE)}, e.g. 250 or 1 250,50.`
          : "Enter a price, or choose “Price on request”.",
      });
      return z.NEVER;
    }
    return { ...base, price };
  });

export type ProductInput = z.output<typeof productSchema>;

// ---------------------------------------------------------------------------
// Quick price editing: several items in one save.
// ---------------------------------------------------------------------------

export const bulkRowSchema = z.object({
  id: z.string().uuid(),
  priceType: z.enum(["FIXED", "FROM", "ON_REQUEST"]),
  price: z.string().trim().max(20),
  availability: z.enum(["IN_STOCK", "PRE_ORDER", "MADE_TO_ORDER", "OUT_OF_STOCK", "BY_BOOKING"]),
});

export type BulkRow = z.infer<typeof bulkRowSchema>;

// Checks one row against its item's kind. Returns the values to save, or an
// error message for that row.
export function checkBulkRow(
  row: BulkRow,
  kind: "PRODUCT" | "SERVICE",
): { ok: true; priceType: BulkRow["priceType"]; price: string | null; availability: AvailabilityValue } | { ok: false; error: string } {
  if (!(AVAILABILITY_FOR_KIND[kind] as AvailabilityValue[]).includes(row.availability)) {
    return { ok: false, error: kind === "SERVICE" ? "Services are by booking or not taking bookings." : "Choose an option that fits a product." };
  }
  if (row.priceType === "ON_REQUEST") return { ok: true, priceType: row.priceType, price: null, availability: row.availability };
  const price = parsePrice(row.price);
  if (!price) return { ok: false, error: row.price ? `Enter an amount between R1 and ${formatRand(MAX_PRICE)}.` : "Enter a price." };
  return { ok: true, priceType: row.priceType, price, availability: row.availability };
}
