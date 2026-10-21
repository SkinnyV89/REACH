import { describe, expect, it } from "vitest";
import {
  SHARE_LINK_RE,
  generateShareCode,
  personalise,
  personaliseCopy,
  shareLinkPath,
  templateMasterCopy,
  validateMasterCopy,
  type MasterCopy,
} from "@/lib/campaign-rules";

const good: MasterCopy = {
  title: "Hair that turns heads",
  objective: "Get new customers to message about weaves and wigs.",
  headline: "Your next look starts at {{business_name}}",
  body: "Ready for a fresh style? {{business_name}} in {{location}} can help you find hair you'll love. Send a message to see what's available.",
  call_to_action: "Message us on WhatsApp",
};

const problems = (copy: Partial<MasterCopy>) => validateMasterCopy({ ...good, ...copy }).map((v) => v.problem);

describe("validateMasterCopy", () => {
  it("accepts honest copy that uses the placeholders correctly", () => {
    expect(validateMasterCopy(good)).toEqual([]);
  });

  it("allows 'look your best' but not superlative claims about the seller", () => {
    expect(problems({ body: "{{business_name}} helps you look and feel your best." })).toEqual([]);
    expect(problems({ headline: "The best weaves at {{business_name}}" })).toContain("headline contains a superlative claim");
    expect(problems({ headline: "#1 hair at {{business_name}}" })).toContain("headline contains a superlative claim");
  });

  it.each([
    ["Weaves from R299 at {{business_name}}", "a rand amount"],
    ["20% off at {{business_name}}", "a percentage"],
    ["Big sale at {{business_name}}", "a discount or promotion"],
    ["Free delivery from {{business_name}}", 'the word "free"'],
    ["Guaranteed results at {{business_name}}", "a guarantee"],
    ["{{business_name}} cures dry scalp", "a health or medical claim"],
    ["Loved by 500 customers, 5 stars, {{business_name}}", "reviews, ratings or awards"],
    ["Visit www.example.co.za for {{business_name}}", "a link"],
    ["Call 082 123 4567 for {{business_name}}", "a phone number"],
    ["Follow @thandihair for {{business_name}}", "a social media handle"],
  ])("rejects %s", (headline, what) => {
    expect(problems({ headline })).toContain(`headline contains ${what}`);
  });

  it("enforces length limits", () => {
    expect(problems({ headline: `{{business_name}} ${"x".repeat(80)}` })[0]).toMatch(/headline is \d+ characters; the limit is 70/);
    expect(problems({ call_to_action: "" })).toContain("call_to_action is empty");
  });

  it("requires {{business_name}} in the headline or body", () => {
    expect(problems({ headline: "Fresh hair", body: "Get fresh hair today." })).toContain(
      "{{business_name}} must appear in the headline or the body",
    );
  });

  it("rejects unknown placeholders, stray braces and repeated {{location}}", () => {
    expect(problems({ body: "{{business_name}} has {{price}} deals" })).toContain(
      "body uses an unknown placeholder {{price}}",
    );
    expect(problems({ body: "{{business_name}} {is} here" })).toContain("body contains stray curly braces");
    expect(problems({ headline: "{{business_name}} in {{location}}", body: "Now in {{location}}." })).toContain(
      "{{location}} may be used at most once",
    );
  });
});

describe("personalise", () => {
  it("fills placeholders from seller facts only", () => {
    const copy = personaliseCopy(
      { headline: good.headline, body: good.body, callToAction: good.call_to_action },
      { businessName: "Thandi's Hair Boutique", location: "Soweto" },
    );
    expect(copy.headline).toBe("Your next look starts at Thandi's Hair Boutique");
    expect(copy.body).toContain("Thandi's Hair Boutique in Soweto");
    expect(JSON.stringify(copy)).not.toContain("{{");
  });

  it("uses a neutral phrase when the location is missing", () => {
    expect(personalise("Now in {{location}}", { businessName: "X", location: null })).toBe("Now in your area");
  });

  it("does not interpret seller input as placeholders or patterns", () => {
    expect(personalise("Hi from {{business_name}}", { businessName: "$& {{location}} $1", location: "Soweto" })).toBe(
      "Hi from $& {{location}} $1",
    );
  });

  it("gives two sellers independent copy from the same master", () => {
    const master = { headline: good.headline, body: good.body, callToAction: good.call_to_action };
    const a = personaliseCopy(master, { businessName: "Thandi's Hair", location: "Soweto" });
    const b = personaliseCopy(master, { businessName: "Lindiwe Hair & Beauty", location: "Durban" });
    expect(a.headline).not.toEqual(b.headline);
    expect(b.body).toContain("Lindiwe Hair & Beauty in Durban");
  });
});

describe("share links", () => {
  it("are slug plus an 8-character random code", () => {
    const path = shareLinkPath("thandis-hair-boutique", generateShareCode());
    expect(path).toMatch(SHARE_LINK_RE);
    expect(path.startsWith("thandis-hair-boutique-")).toBe(true);
  });

  it("don't repeat across many generations", () => {
    const codes = new Set(Array.from({ length: 5000 }, () => generateShareCode()));
    expect(codes.size).toBe(5000);
  });

  it("avoid look-alike characters", () => {
    for (let i = 0; i < 200; i++) expect(generateShareCode()).not.toMatch(/[0O1lI]/);
  });
});

describe("templateMasterCopy", () => {
  it.each([
    "Hair, wigs & weaves",
    "Clothing, shoes & accessories",
    "Food, baking & catering",
    "Professional & personal services",
    "Perfumes & fragrances",
    "Gifts & custom products",
    "Other",
  ])("passes the same validation as AI copy for %s", (name) => {
    expect(validateMasterCopy(templateMasterCopy({ name }))).toEqual([]);
  });
});
