import { describe, expect, it } from "vitest";
import { leadFormSchema, normalisePhone, parseChannel, whatsappGreeting, whatsappLink } from "@/lib/lead-rules";

describe("parseChannel", () => {
  it.each([
    ["whatsapp", "WHATSAPP"],
    ["WhatsApp", "WHATSAPP"],
    ["wa", "WHATSAPP"],
    ["facebook", "FACEBOOK"],
    ["ig", "INSTAGRAM"],
    ["tiktok", "TIKTOK"],
    ["reach", "REACH"], // REACH's own Explore and feed links
    ["REACH", "REACH"],
  ])("maps %s", (src, channel) => {
    expect(parseChannel(src).channel).toBe(channel);
  });

  it("never guesses: missing or unknown sources are UNKNOWN", () => {
    expect(parseChannel(undefined)).toEqual({ channel: "UNKNOWN", utmSource: null });
    expect(parseChannel("newsletter")).toEqual({ channel: "UNKNOWN", utmSource: "newsletter" });
  });

  it("sanitises the stored raw value", () => {
    expect(parseChannel("<script>alert(1)</script>").utmSource).toBe("scriptalert1script");
    expect(parseChannel("x".repeat(100)).utmSource).toHaveLength(40);
    expect(parseChannel(["facebook", "tiktok"]).channel).toBe("FACEBOOK");
  });
});

describe("normalisePhone", () => {
  it.each([
    ["082 123 4567", "+27821234567"],
    ["011 123 4567", "+27111234567"], // landlines are fine for a callback
    ["+27 82 123 4567", "+27821234567"],
    ["+44 7700 900123", "+447700900123"],
  ])("accepts %s", (input, expected) => {
    expect(normalisePhone(input)).toBe(expected);
  });

  it.each(["082 123", "hello", "", "0921234567", "821234567"])("rejects %s", (input) => {
    expect(normalisePhone(input)).toBeNull();
  });
});

describe("whatsappLink", () => {
  it("builds a click-to-chat link with the message encoded", () => {
    expect(whatsappLink("+27821234567", whatsappGreeting("Thandi's Hair & Beauty"))).toBe(
      "https://wa.me/27821234567?text=Hi%20Thandi's%20Hair%20%26%20Beauty%2C%20I%20saw%20your%20campaign%20on%20REACH%20and%20I'd%20like%20to%20know%20more.",
    );
  });
});

describe("leadFormSchema", () => {
  const base = { name: " Sipho ", contact: "072 555 0199", message: " ", consent: "on" };

  it("normalises a valid enquiry", () => {
    expect(leadFormSchema.parse(base)).toEqual({ name: "Sipho", contact: "+27725550199", message: null, consent: "on" });
  });

  it("requires consent", () => {
    const result = leadFormSchema.safeParse({ ...base, consent: undefined });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual(["consent"]);
  });

  it("rejects bad numbers and overlong messages", () => {
    const result = leadFormSchema.safeParse({ ...base, contact: "123", message: "x".repeat(501) });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((i) => i.path[0]).sort()).toEqual(["contact", "message"]);
  });
});
