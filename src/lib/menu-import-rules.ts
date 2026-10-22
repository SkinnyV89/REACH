import { z } from "zod";
import { parsePrice } from "@/lib/product-rules";
import type { AvailabilityValue } from "@/lib/storefront-rules";

// Reading a flyer into draft items. Pure and shared by the browser and the
// server: what the model must return, how its answer becomes an editable
// draft, and how a reviewed draft row is checked before saving.

export const MAX_IMPORT_ITEMS = 60;
export const MENU_IMPORTS_PER_HOUR = 10;
// Claude reads images up to about 1568 px on the long side without scaling.
export const MENU_IMAGE_MAX_DIMENSION = 1568;

// What the model returns. Kept simple (no length limits) so the structured
// output grammar stays small; limits are applied in toDraft().
export const menuOutputSchema = z.object({
  is_price_list: z.boolean(),
  items: z.array(
    z.object({
      name: z.string(),
      kind: z.enum(["PRODUCT", "SERVICE"]),
      price_type: z.enum(["FIXED", "FROM", "ON_REQUEST"]),
      price: z.number().nullable(),
      description: z.string().nullable(),
    }),
  ),
  warnings: z.array(z.string()),
});

export type MenuOutput = z.infer<typeof menuOutputSchema>;

export type DraftItem = {
  name: string;
  kind: "PRODUCT" | "SERVICE";
  priceType: "FIXED" | "FROM" | "ON_REQUEST";
  price: string; // as the seller will see and edit it, e.g. "25" or "12.50"
  description: string;
};

export type MenuDraft = { items: DraftItem[]; warnings: string[] };

const clip = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max).trim();

// Turns the model's answer into a draft the seller can edit: names and notes
// trimmed to the catalogue's limits, unreadable prices become "on request"
// with a warning, exact duplicates dropped, and at most MAX_IMPORT_ITEMS.
export function toDraft(output: MenuOutput): MenuDraft {
  const warnings = output.warnings.map((w) => clip(w, 200)).filter(Boolean).slice(0, 10);
  if (!output.is_price_list) {
    return { items: [], warnings: ["This photo doesn't look like a menu, flyer or price list. Try a clearer photo of your prices."] };
  }

  const items: DraftItem[] = [];
  const seen = new Set<string>();
  let unreadable = 0;
  for (const raw of output.items) {
    const name = clip(raw.name, 100);
    if (name.length < 2) continue;
    let priceType = raw.price_type;
    let price = "";
    if (priceType !== "ON_REQUEST") {
      const parsed = raw.price === null ? null : parsePrice(String(raw.price));
      if (parsed) price = parsed.endsWith(".00") ? parsed.slice(0, -3) : parsed;
      else {
        priceType = "ON_REQUEST";
        unreadable++;
      }
    }
    const key = `${name.toLowerCase()}|${priceType}|${price}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ name, kind: raw.kind, priceType, price, description: clip(raw.description ?? "", 300) });
  }

  if (unreadable) {
    warnings.push(`${unreadable === 1 ? "One item has" : `${unreadable} items have`} no price we could read. They're set to "Price on request"; add the price if you have one.`);
  }
  if (items.length > MAX_IMPORT_ITEMS) {
    warnings.push(`We kept the first ${MAX_IMPORT_ITEMS} items. Add the rest from another photo.`);
    items.length = MAX_IMPORT_ITEMS;
  }
  return { items, warnings };
}

// A reviewed draft row, as sent back by the import page.
export const importRowSchema = z.object({
  name: z.string(),
  kind: z.enum(["PRODUCT", "SERVICE"]),
  categoryId: z.string(),
  priceType: z.enum(["FIXED", "FROM", "ON_REQUEST"]),
  price: z.string().max(20),
  description: z.string().max(1000),
  availability: z.enum(["IN_STOCK", "PRE_ORDER", "MADE_TO_ORDER", "OUT_OF_STOCK", "BY_BOOKING"]),
});

export type ImportRow = z.infer<typeof importRowSchema> & { availability: AvailabilityValue };

// The fields productSchema expects, from an import row.
export function toProductFields(row: ImportRow) {
  return {
    kind: row.kind,
    name: row.name,
    categoryId: row.categoryId,
    description: row.description,
    priceType: row.priceType,
    price: row.price,
    availability: row.availability,
    leadTimeDays: "",
  };
}
