import { describe, expect, it } from "vitest";
import {
  AVAILABILITY_FOR_KIND,
  availabilityLabel,
  formatArea,
  formatUpdated,
  itemSlug,
  itemSlugCandidates,
  layoutForCategories,
  parseCampaignCode,
  publishCheck,
  serviceModeLines,
  shareCodeOf,
  statusFromAvailability,
  storefrontSchema,
} from "@/lib/storefront-rules";

describe("layoutForCategories", () => {
  it("picks a layout from what the seller sells", () => {
    expect(layoutForCategories(["barbers-mens-grooming"])).toBe("PORTFOLIO");
    expect(layoutForCategories(["hair-wigs-weaves", "clothing-shoes-accessories"])).toBe("PORTFOLIO");
    expect(layoutForCategories(["food-baking-catering", "hair-wigs-weaves"])).toBe("MENU");
    expect(layoutForCategories(["electronics"])).toBe("PRODUCT_GRID");
  });
});

describe("availability", () => {
  it("offers only options that fit the kind of listing", () => {
    expect(AVAILABILITY_FOR_KIND.SERVICE).toEqual(["BY_BOOKING", "OUT_OF_STOCK"]);
    expect(AVAILABILITY_FOR_KIND.PRODUCT).not.toContain("BY_BOOKING");
  });

  it("words out-of-stock services as not taking bookings", () => {
    expect(availabilityLabel("OUT_OF_STOCK", "SERVICE")).toBe("Not taking bookings");
    expect(availabilityLabel("OUT_OF_STOCK", "PRODUCT")).toBe("Out of stock");
  });

  it("mirrors availability into the older status column", () => {
    expect(statusFromAvailability("OUT_OF_STOCK")).toBe("UNAVAILABLE");
    expect(statusFromAvailability("PRE_ORDER")).toBe("AVAILABLE");
    expect(statusFromAvailability("BY_BOOKING")).toBe("AVAILABLE");
  });

  it("says how fresh the stock status is", () => {
    const now = new Date("2026-10-21T12:00:00Z");
    const ago = (d: number) => new Date(now.getTime() - d * 86_400_000);
    expect(formatUpdated(ago(0), now)).toBe("updated today");
    expect(formatUpdated(ago(1), now)).toBe("updated yesterday");
    expect(formatUpdated(ago(3), now)).toBe("updated 3 days ago");
    expect(formatUpdated(ago(45), now)).toBe("updated 1 month ago");
    expect(formatUpdated(ago(400), now)).toBe("updated over a year ago");
  });
});

describe("item slugs", () => {
  it("makes readable, safe slugs", () => {
    expect(itemSlug("Knotless Braids (waist length)")).toBe("knotless-braids-waist-length");
    expect(itemSlug("Crème brûlée & tart!!")).toBe("creme-brulee-tart");
    expect(itemSlug("💇‍♀️✨")).toBe("item");
    expect(itemSlug("Reviews")).toBe("reviews-item"); // reserved for a future page
    expect(itemSlug("x".repeat(100))).toHaveLength(60);
  });

  it("numbers duplicates within the length limit", () => {
    const c = itemSlugCandidates("x".repeat(60));
    expect(c[1].endsWith("-2")).toBe(true);
    expect(c.every((s) => s.length <= 60)).toBe(true);
  });
});

describe("campaign codes", () => {
  it("accepts only well-formed share codes", () => {
    expect(parseCampaignCode("UMcCgwVc")).toBe("UMcCgwVc");
    expect(parseCampaignCode(["UMcCgwVc", "x"])).toBe("UMcCgwVc");
    expect(parseCampaignCode("short")).toBeNull();
    expect(parseCampaignCode("UMcCgwV0")).toBeNull(); // 0 isn't in the alphabet
    expect(parseCampaignCode(undefined)).toBeNull();
    expect(shareCodeOf("thandis-hair-UMcCgwVc")).toBe("UMcCgwVc");
  });
});

describe("area and service wording", () => {
  it("shows neighbourhood and town, falling back to the older free text", () => {
    expect(formatArea({ areaDetail: "Pimville", placeName: "Soweto" })).toBe("Pimville, Soweto");
    expect(formatArea({ areaDetail: "soweto", placeName: "Soweto" })).toBe("Soweto");
    expect(formatArea({ location: "Tembisa", province: "GAUTENG" })).toBe("Tembisa, Gauteng");
    expect(formatArea({})).toBeNull();
  });

  it("words delivery and collection for services and goods", () => {
    expect(serviceModeLines(["DELIVERY", "COLLECTION"], "PORTFOLIO", 10)).toEqual(["Comes to you within 10 km", "Visit them"]);
    expect(serviceModeLines(["DELIVERY"], "MENU", null)).toEqual(["Delivers"]);
    expect(serviceModeLines(["COLLECTION", "ONLINE"], "PRODUCT_GRID", 5)).toEqual(["Collection available", "Online or remote"]);
  });
});

describe("storefront schema and publishing", () => {
  const base = { tagline: " ", description: "", placeId: crypto.randomUUID(), areaDetail: " Pimville ", serviceRadiusKm: "", layout: "PORTFOLIO" };

  it("normalises the editor input", () => {
    expect(storefrontSchema.parse(base)).toMatchObject({ tagline: null, description: null, areaDetail: "Pimville", serviceRadiusKm: null });
    expect(storefrontSchema.parse({ ...base, serviceRadiusKm: "15" }).serviceRadiusKm).toBe(15);
  });

  it("rejects a missing place and silly radiuses", () => {
    expect(storefrontSchema.safeParse({ ...base, placeId: "" }).success).toBe(false);
    for (const r of ["0", "201", "2.5", "far"]) expect(storefrontSchema.safeParse({ ...base, serviceRadiusKm: r }).success).toBe(false);
  });

  it("lists everything missing before publishing", () => {
    expect(publishCheck({ hasLocation: true, listingCount: 1, hasWhatsapp: true })).toEqual({ ok: true, missing: [] });
    expect(publishCheck({ hasLocation: false, listingCount: 0, hasWhatsapp: false }).missing).toHaveLength(3);
  });
});
