import { describe, expect, it } from "vitest";
import {
  MAX_UPLOAD_BYTES,
  UPLOAD_ERROR_MESSAGES,
  altTextSchema,
  fitWithin,
  needsPeopleConsent,
  uploadErrorMessage,
} from "@/lib/media-rules";

describe("media rules", () => {
  it("keeps uploads safely under Vercel's 4.5 MB request limit", () => {
    expect(MAX_UPLOAD_BYTES).toBeLessThan(4.5 * 1024 * 1024 - 100 * 1024);
  });

  it("fits images inside a box without enlarging them", () => {
    expect(fitWithin(4000, 3000, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(fitWithin(3000, 4000, 2048)).toEqual({ width: 1536, height: 2048 });
    expect(fitWithin(800, 600, 2048)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(10000, 10, 2048)).toEqual({ width: 2048, height: 2 });
    expect(fitWithin(10000, 1, 2048).height).toBe(1); // never zero
  });

  it("asks for people's permission on cover and item photos, not logos", () => {
    expect(needsPeopleConsent("product")).toBe(true);
    expect(needsPeopleConsent("cover")).toBe(true);
    expect(needsPeopleConsent("logo")).toBe(false);
  });

  it("trims descriptions, treats empty as none, and limits length", () => {
    expect(altTextSchema.parse("  Waist-length braids ")).toBe("Waist-length braids");
    expect(altTextSchema.parse("   ")).toBeNull();
    expect(altTextSchema.safeParse("x".repeat(201)).success).toBe(false);
  });

  it("has a plain message for every error, and a fallback for unknown ones", () => {
    for (const message of Object.values(UPLOAD_ERROR_MESSAGES)) expect(message.length).toBeGreaterThan(10);
    expect(uploadErrorMessage("too_large")).toContain("4 MB");
    expect(uploadErrorMessage("nonsense")).toBe(UPLOAD_ERROR_MESSAGES.failed);
    expect(uploadErrorMessage(undefined)).toBe(UPLOAD_ERROR_MESSAGES.failed);
  });
});
