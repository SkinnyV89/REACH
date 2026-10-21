import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
const { describeHighlights, formatRate, parsePeriod, rate } = await import("@/lib/analytics");

type A = Parameters<typeof describeHighlights>[0];
const channels = (leads: Partial<Record<string, number>>) =>
  (["WHATSAPP", "FACEBOOK", "INSTAGRAM", "TIKTOK", "UNKNOWN"] as const).map((channel) => ({
    channel,
    label: { WHATSAPP: "WhatsApp", FACEBOOK: "Facebook", INSTAGRAM: "Instagram", TIKTOK: "TikTok", UNKNOWN: "Unknown" }[channel],
    views: 0,
    clicks: 0,
    leads: leads[channel] ?? 0,
  }));
const analytics = (leadsByChannel: Partial<Record<string, number>>, campaigns: { headline: string; leads: number }[] = []): A => {
  const total = Object.values(leadsByChannel).reduce((n: number, v) => n + (v ?? 0), 0);
  return {
    funnel: { views: 10, clicks: 2, leads: total, converted: 0 },
    channels: channels(leadsByChannel),
    campaigns: campaigns.map((c, i) => ({ id: `${i}`, status: "ACTIVE", masterTitle: "m", category: "c", source: "TEMPLATE", views: 0, clicks: 0, converted: 0, ...c })),
    hasData: true,
  } as A;
};

describe("rate and formatRate", () => {
  it("shows a dash instead of 0% when there's nothing to divide by", () => {
    expect(rate(3, 0)).toBeNull();
    expect(formatRate(null)).toBe("—");
  });

  it("formats small and large rates readably", () => {
    expect(formatRate(rate(1, 40))).toBe("2.5%");
    expect(formatRate(rate(12, 40))).toBe("30%");
    expect(formatRate(rate(0, 40))).toBe("0%");
  });
});

describe("parsePeriod", () => {
  it("defaults to 30 days and ignores unknown values", () => {
    expect(parsePeriod(undefined).key).toBe("30d");
    expect(parsePeriod("forever").key).toBe("30d");
    expect(parsePeriod("all")).toMatchObject({ key: "all", days: null });
    expect(parsePeriod(["7d", "90d"]).key).toBe("7d");
  });
});

describe("describeHighlights", () => {
  it("says nothing when there are no enquiries", () => {
    expect(describeHighlights(analytics({}))).toEqual([]);
  });

  it("names the top channel with real numbers", () => {
    expect(describeHighlights(analytics({ FACEBOOK: 4, WHATSAPP: 2 }))).toEqual(["Most enquiries came from Facebook: 4 of 6."]);
  });

  it("reports ties instead of picking one", () => {
    expect(describeHighlights(analytics({ FACEBOOK: 2, TIKTOK: 2 }))[0]).toBe(
      "Facebook and TikTok brought in the most enquiries (2 each).",
    );
  });

  it("never calls Unknown the top channel, and explains untagged enquiries", () => {
    const h = describeHighlights(analytics({ UNKNOWN: 5, INSTAGRAM: 1 }));
    expect(h[0]).toBe("Most enquiries came from Instagram: 1 of 6.");
    expect(h[1]).toMatch(/^5 of 6 enquiries came through a link without a channel tag/);
    expect(describeHighlights(analytics({ UNKNOWN: 3 }))).toHaveLength(1);
  });

  it("names the best campaign only when there's a comparison", () => {
    expect(describeHighlights(analytics({ WHATSAPP: 1 }, [{ headline: "Only one", leads: 1 }]))).toHaveLength(1);
    const h = describeHighlights(analytics({ WHATSAPP: 3 }, [{ headline: "Best", leads: 2 }, { headline: "Other", leads: 1 }]));
    expect(h).toContain('"Best" has the most enquiries (2).');
  });
});
