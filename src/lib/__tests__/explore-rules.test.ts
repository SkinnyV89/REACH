import { describe, expect, it } from "vitest";
import {
  PAID_PLACEMENT_PROMISE,
  WEIGHTS,
  completeSignal,
  distanceKm,
  distanceLabel,
  diversify,
  exploreHref,
  freshSignal,
  hashUnit,
  nearSignal,
  nearestPlace,
  newSignal,
  normaliseQuery,
  parsePage,
  rankByScore,
  reasonChips,
  roundCoordinate,
  rotationDay,
  scoreSignals,
} from "@/lib/explore-rules";

const soweto = { latitude: -26.268, longitude: 27.858 };
const joburg = { latitude: -26.202, longitude: 28.044 };
const pretoria = { latitude: -25.745, longitude: 28.188 };
const capeTown = { latitude: -33.926, longitude: 18.423 };
const day = (n: number) => new Date(Date.UTC(2026, 9, 22) - n * 86_400_000);
const now = day(0);

describe("distance", () => {
  it("measures between town centres", () => {
    expect(distanceKm(soweto, joburg)).toBeGreaterThan(18);
    expect(distanceKm(soweto, joburg)).toBeLessThan(22);
    expect(distanceKm(soweto, pretoria)).toBeGreaterThan(60);
    expect(distanceKm(soweto, soweto)).toBe(0);
  });

  it("labels distances as approximate, by town", () => {
    expect(distanceLabel(0, true, "Soweto")).toBe("In Soweto");
    expect(distanceLabel(3.2, false, "Roodepoort")).toBe("Roodepoort · nearby");
    expect(distanceLabel(12.4, false, "Roodepoort")).toBe("Roodepoort · about 12 km away");
    expect(distanceLabel(63, false, "Pretoria")).toBe("Pretoria · about 65 km away");
  });

  it("rounds a shared location to about 1 km and snaps it to the nearest town", () => {
    expect(roundCoordinate(-26.26789)).toBe(-26.27);
    expect(roundCoordinate(27.85512)).toBe(27.86);
    const towns = [
      { slug: "soweto", ...soweto },
      { slug: "johannesburg", ...joburg },
      { slug: "pretoria", ...pretoria },
    ];
    expect(nearestPlace({ latitude: -26.25, longitude: 27.9 }, towns)?.slug).toBe("soweto");
    expect(nearestPlace({ latitude: -25.8, longitude: 28.2 }, towns)?.slug).toBe("pretoria");
    // Nowhere near any town (here: Cape Town against Gauteng towns): no guess.
    expect(nearestPlace(capeTown, towns)).toBeNull();
  });
});

describe("signals", () => {
  it("near: by distance band, raised when the seller delivers to the buyer", () => {
    expect(nearSignal(0, true, false)).toBe(1);
    expect(nearSignal(8, false, false)).toBe(0.8);
    expect(nearSignal(20, false, false)).toBe(0.6);
    expect(nearSignal(50, false, false)).toBe(0.3);
    expect(nearSignal(500, false, false)).toBe(0.1);
    expect(nearSignal(50, false, true)).toBe(0.8);
    expect(nearSignal(0, true, true)).toBe(1);
  });

  it("fresh: halves every 14 days, counted in whole days", () => {
    expect(freshSignal(null, now)).toBe(0);
    expect(freshSignal(now, now)).toBe(1);
    expect(freshSignal(day(14), now)).toBeCloseTo(0.5);
    expect(freshSignal(day(28), now)).toBeCloseTo(0.25);
    // Ten posts today count the same as one: only the last activity's day matters.
    expect(freshSignal(new Date(now.getTime() - 3600_000), now)).toBe(1);
  });

  it("complete: five checks, each worth a fifth", () => {
    const full = { listings: 4, listingsWithPhoto: 2, listingsWithPrice: 3, posts: 1, hasLogoOrCover: true, hasDescription: true };
    expect(completeSignal(full)).toBe(1);
    expect(completeSignal({ ...full, listingsWithPhoto: 1 })).toBe(0.8); // fewer than half have photos
    expect(completeSignal({ ...full, posts: 0, hasDescription: false })).toBeCloseTo(0.6);
    expect(completeSignal({ listings: 0, listingsWithPhoto: 0, listingsWithPrice: 0, posts: 0, hasLogoOrCover: false, hasDescription: false })).toBe(0);
  });

  it("new: full for 14 days, then fading to zero over the next 14", () => {
    expect(newSignal(day(0), now)).toBe(1);
    expect(newSignal(day(14), now)).toBe(1);
    expect(newSignal(day(21), now)).toBeCloseTo(0.5);
    expect(newSignal(day(28), now)).toBe(0);
    expect(newSignal(day(90), now)).toBe(0);
  });
});

describe("score", () => {
  it("weights near 40%, fresh 30%, complete 20%, new 10%", () => {
    expect(WEIGHTS).toEqual({ near: 0.4, fresh: 0.3, complete: 0.2, isNew: 0.1 });
    expect(scoreSignals({ near: 1, fresh: 1, complete: 1, isNew: 1 })).toBeCloseTo(1);
    expect(scoreSignals({ near: 1, fresh: 0, complete: 0, isNew: 0 })).toBeCloseTo(0.4);
    expect(scoreSignals({ near: 0, fresh: 0, complete: 1, isNew: 0 })).toBeCloseTo(0.2);
  });

  it("without a buyer location, shares the near weight out among the others", () => {
    expect(scoreSignals({ near: null, fresh: 1, complete: 1, isNew: 1 })).toBeCloseTo(1);
    expect(scoreSignals({ near: null, fresh: 1, complete: 0, isNew: 0 })).toBeCloseTo(0.5);
    expect(scoreSignals({ near: null, fresh: 0, complete: 0, isNew: 1 })).toBeCloseTo(1 / 6);
  });

  it("a brand-new nearby seller can outrank an established far one", () => {
    const fresh = scoreSignals({ near: 1, fresh: 1, complete: 0.4, isNew: 1 });
    const established = scoreSignals({ near: 0.1, fresh: 0.5, complete: 1, isNew: 0 });
    expect(fresh).toBeGreaterThan(established);
  });

  it("has no input for followers or enquiries", () => {
    expect(Object.keys(WEIGHTS).sort()).toEqual(["complete", "fresh", "isNew", "near"]);
    expect(PAID_PLACEMENT_PROMISE).toBe("Rankings can't be bought. Any paid placement will be labelled Sponsored.");
  });
});

describe("ordering", () => {
  const items = Array.from({ length: 12 }, (_, i) => ({ id: `s${i}`, score: 0.5 }));

  it("puts clearly higher scores first", () => {
    const ranked = rankByScore([{ id: "low", score: 0.2 }, { id: "high", score: 0.9 }, { id: "mid", score: 0.5 }], "2026-10-22");
    expect(ranked.map((r) => r.id)).toEqual(["high", "mid", "low"]);
  });

  it("rotates equal sellers daily, but keeps the same order all day", () => {
    const a = rankByScore(items, "2026-10-22").map((r) => r.id);
    expect(rankByScore(items, "2026-10-22").map((r) => r.id)).toEqual(a);
    expect(rankByScore([...items].reverse(), "2026-10-22").map((r) => r.id)).toEqual(a);
    const b = rankByScore(items, "2026-10-23").map((r) => r.id);
    expect(b).not.toEqual(a);
    expect([...b].sort()).toEqual([...a].sort());
  });

  it("uses the South African day", () => {
    expect(rotationDay(new Date("2026-10-22T21:30:00Z"))).toBe("2026-10-22");
    expect(rotationDay(new Date("2026-10-22T22:30:00Z"))).toBe("2026-10-23"); // 00:30 in Johannesburg
  });

  it("hashUnit is stable and spread over 0..1", () => {
    expect(hashUnit("x")).toBe(hashUnit("x"));
    const values = Array.from({ length: 200 }, (_, i) => hashUnit(`k${i}`));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    expect(values.filter((v) => v < 0.5).length).toBeGreaterThan(70);
  });

  it("allows at most two in a row from one category, keeping order otherwise", () => {
    const list = ["hair", "hair", "hair", "hair", "food", "barber"].map((c, i) => ({ id: `${c}${i}`, c }));
    expect(diversify(list, (x) => x.c).map((x) => x.c)).toEqual(["hair", "hair", "food", "hair", "hair", "barber"]);
    const onlyHair = ["hair", "hair", "hair"].map((c, i) => ({ id: `${c}${i}`, c }));
    expect(diversify(onlyHair, (x) => x.c)).toHaveLength(3); // nothing to swap in: unchanged
  });
});

describe("reason chips", () => {
  it("explain why a seller is shown, honestly", () => {
    expect(reasonChips({ distance: "In Soweto", deliversToBuyer: false, lastPostAt: day(2), isNew: true, now })).toEqual([
      "In Soweto",
      "Posted 2 days ago",
      "New on REACH",
    ]);
    expect(reasonChips({ distance: "Johannesburg · about 20 km away", deliversToBuyer: true, lastPostAt: day(1), isNew: false, now })).toEqual([
      "Johannesburg · about 20 km away",
      "Delivers to your area",
      "Posted yesterday",
    ]);
    expect(reasonChips({ distance: null, deliversToBuyer: false, lastPostAt: day(45), isNew: false, now })).toEqual([]);
  });
});

describe("queries and URLs", () => {
  it("normalises search text", () => {
    expect(normaliseQuery("  knotless   braids ")).toBe("knotless braids");
    expect(normaliseQuery("a")).toBeNull();
    expect(normaliseQuery(undefined)).toBeNull();
    expect(normaliseQuery("x".repeat(100))).toHaveLength(60);
  });

  it("uses landing pages for town + category, queries otherwise", () => {
    expect(exploreHref({ near: "soweto-gauteng", cat: "hair-beauty" })).toBe("/explore/hair-beauty/soweto-gauteng");
    expect(exploreHref({ near: "soweto-gauteng", cat: "hair-beauty", page: 2 })).toBe("/explore?near=soweto-gauteng&cat=hair-beauty&page=2");
    expect(exploreHref({ near: "soweto-gauteng", cat: "hair-beauty", tab: "work" })).toBe("/explore?near=soweto-gauteng&cat=hair-beauty&tab=work");
    expect(exploreHref({ q: "fade & line-up" })).toBe("/explore?q=fade+%26+line-up");
    expect(exploreHref({})).toBe("/explore");
    expect(parsePage("3")).toBe(3);
    expect(parsePage("-1")).toBe(1);
    expect(parsePage("9999")).toBe(1);
  });
});
