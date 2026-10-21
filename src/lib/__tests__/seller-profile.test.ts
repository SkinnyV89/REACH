import { describe, expect, it } from "vitest";
import {
  businessStepSchema,
  categoriesStepSchema,
  extrasStepSchema,
  formDataToObject,
  formatWhatsappNumber,
  normaliseSocialUrl,
  normaliseWebsiteUrl,
  normaliseWhatsappNumber,
  slugCandidates,
  slugify,
  SLUG_MAX_LENGTH,
} from "@/lib/seller-profile";

describe("normaliseWhatsappNumber", () => {
  it.each([
    ["082 123 4567", "+27821234567"],
    ["0821234567", "+27821234567"],
    ["+27 82 123 4567", "+27821234567"],
    ["27821234567", "+27821234567"],
    ["(072) 555-0199", "+27725550199"],
    ["0027 61 234 5678", "+27612345678"],
    ["+44 7700 900123", "+447700900123"],
  ])("accepts %s", (input, expected) => {
    expect(normaliseWhatsappNumber(input)).toBe(expected);
  });

  it.each(["011 123 4567", "082 123 456", "hello", "", "+27 82 123 45678", "821234567"])(
    "rejects %s",
    (input) => {
      expect(normaliseWhatsappNumber(input)).toBeNull();
    },
  );
});

describe("slugify", () => {
  it("turns a business name into a readable address", () => {
    expect(slugify("Thandi's Hair Boutique")).toBe("thandis-hair-boutique");
    expect(slugify("  Hair & Beauty by Amanda!! ")).toBe("hair-and-beauty-by-amanda");
    expect(slugify("Café Zoë")).toBe("cafe-zoe");
  });

  it("never returns an empty or reserved slug", () => {
    expect(slugify("!!!")).toBe("seller");
    expect(slugify("Dashboard")).toBe("dashboard-shop");
    expect(slugify("API")).toBe("api-shop");
  });

  it("caps the length without a trailing dash", () => {
    const slug = slugify("a ".repeat(60));
    expect(slug.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("slugCandidates", () => {
  it("numbers duplicates and keeps them within the length limit", () => {
    const long = "x".repeat(SLUG_MAX_LENGTH);
    const [first, second] = slugCandidates("thandis-hair");
    expect([first, second]).toEqual(["thandis-hair", "thandis-hair-2"]);
    for (const c of slugCandidates(long)) expect(c.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
  });
});

describe("normaliseSocialUrl", () => {
  it("accepts handles and profile links", () => {
    expect(normaliseSocialUrl("instagram", "@thandihair")).toBe("https://www.instagram.com/thandihair");
    expect(normaliseSocialUrl("tiktok", "thandihair")).toBe("https://www.tiktok.com/@thandihair");
    expect(normaliseSocialUrl("instagram", "instagram.com/thandihair")).toBe("https://instagram.com/thandihair");
    expect(normaliseSocialUrl("facebook", "http://m.facebook.com/ThandiHair")).toBe("https://m.facebook.com/ThandiHair");
  });

  it("rejects links to other sites", () => {
    expect(normaliseSocialUrl("instagram", "https://evil.example/thandihair")).toBeNull();
    expect(normaliseSocialUrl("facebook", "https://facebook.com.evil.example/x")).toBeNull();
    expect(normaliseSocialUrl("instagram", "https://instagram.com/")).toBeNull();
  });
});

describe("normaliseWebsiteUrl", () => {
  it("adds https and rejects non-web schemes", () => {
    expect(normaliseWebsiteUrl("thandihair.co.za")).toBe("https://thandihair.co.za/");
    expect(normaliseWebsiteUrl("javascript:alert(1)")).toBeNull();
    expect(normaliseWebsiteUrl("not a site")).toBeNull();
  });
});

describe("step schemas", () => {
  it("normalises step 1 and turns an empty description into null", () => {
    expect(
      businessStepSchema.parse({ businessName: " Thandi's Hair ", whatsappNumber: "082 123 4567", description: " " }),
    ).toEqual({ businessName: "Thandi's Hair", whatsappNumber: "+27821234567", description: null });
  });

  it("limits step 2 to three categories and requires fulfilment", () => {
    const ids = Array.from({ length: 4 }, () => crypto.randomUUID());
    const result = categoriesStepSchema.safeParse({
      categoryIds: ids,
      province: "GAUTENG",
      location: "Soweto",
      fulfilment: [],
      serviceArea: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path[0]);
      expect(paths).toContain("categoryIds");
      expect(paths).toContain("fulfilment");
    }
  });

  it("rejects an unknown province", () => {
    expect(
      categoriesStepSchema.safeParse({
        categoryIds: [crypto.randomUUID()],
        province: "ATLANTIS",
        location: "Soweto",
        fulfilment: ["DELIVERY"],
        serviceArea: "",
      }).success,
    ).toBe(false);
  });

  it("allows step 3 to be left empty", () => {
    expect(extrasStepSchema.parse({ instagramUrl: "", facebookUrl: "", tiktokUrl: "", websiteUrl: "" })).toEqual({
      instagramUrl: null,
      facebookUrl: null,
      tiktokUrl: null,
      websiteUrl: null,
    });
  });
});

describe("formDataToObject", () => {
  it("collects checkbox groups into arrays and drops React's internal fields", () => {
    const form = new FormData();
    form.append("categoryIds", "a");
    form.append("categoryIds", "b");
    form.append("location", "Soweto");
    form.append("$ACTION_ID_123", "");
    expect(formDataToObject(form, ["categoryIds", "fulfilment"])).toEqual({
      categoryIds: ["a", "b"],
      fulfilment: [],
      location: "Soweto",
    });
  });
});

describe("formatWhatsappNumber", () => {
  it("shows SA numbers the way sellers write them and round-trips", () => {
    expect(formatWhatsappNumber("+27821234567")).toBe("082 123 4567");
    expect(normaliseWhatsappNumber(formatWhatsappNumber("+27821234567"))).toBe("+27821234567");
    expect(formatWhatsappNumber("+447700900123")).toBe("+447700900123");
    expect(formatWhatsappNumber(null)).toBe("");
  });
});
