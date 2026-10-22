import { describe, expect, it } from "vitest";
import { endOfSaDay, formatTime, hoursInputSchema, openStatus, parseTime, saClock, weekSummary, type Slot } from "@/lib/hours-rules";

// Wednesday 21 October 2026 onwards, given as South African time (UTC+2).
const sa = (time: string, date = "2026-10-21") => new Date(`${date}T${time}:00+02:00`);
const weekdays8to8: Slot[] = [1, 2, 3, 4, 5].map((d) => ({ dayOfWeek: d, opensAt: 8 * 60, closesAt: 20 * 60 }));
const satMorning: Slot = { dayOfWeek: 6, opensAt: 9 * 60, closesAt: 14 * 60 };

describe("clock", () => {
  it("reads South African time", () => {
    expect(saClock(sa("07:55"))).toEqual({ day: 3, minute: 7 * 60 + 55 }); // Wednesday
    expect(saClock(new Date("2026-10-21T22:30:00Z"))).toEqual({ day: 4, minute: 30 }); // 00:30 Thursday in SA
    expect(endOfSaDay(sa("19:00")).toISOString()).toBe("2026-10-21T22:00:00.000Z"); // midnight SA
  });

  it("parses and formats times", () => {
    expect(parseTime("08:00")).toBe(480);
    expect(parseTime("20:05")).toBe(1205);
    expect(parseTime("24:00")).toBe(1440);
    expect(parseTime("8am")).toBeNull();
    expect(parseTime("25:00")).toBeNull();
    expect(formatTime(480)).toBe("08:00");
    expect(formatTime(1440)).toBe("midnight");
  });
});

describe("openStatus", () => {
  const hours = [...weekdays8to8, satMorning];

  it("says open, and when it closes", () => {
    expect(openStatus(hours, sa("12:00"))).toEqual({ open: true, label: "Open now · closes 20:00" });
    expect(openStatus(hours, sa("19:55"))?.open).toBe(true);
  });

  it("says closed, and when it next opens", () => {
    expect(openStatus(hours, sa("07:55"))).toEqual({ open: false, closedToday: false, label: "Closed · opens 08:00 today" });
    expect(openStatus(hours, sa("20:05"))).toEqual({ open: false, closedToday: false, label: "Closed · opens 08:00 tomorrow" });
    // Friday evening: next is Saturday 09:00 (tomorrow); Saturday afternoon: Monday.
    expect(openStatus(hours, sa("21:00", "2026-10-23"))?.label).toBe("Closed · opens 09:00 tomorrow");
    expect(openStatus(hours, sa("15:00", "2026-10-24"))?.label).toBe("Closed · opens 08:00 Mon");
  });

  it("handles slots past midnight", () => {
    const lateNight: Slot[] = [{ dayOfWeek: 5, opensAt: 18 * 60, closesAt: 2 * 60 }]; // Fri 18:00 – Sat 02:00
    expect(openStatus(lateNight, sa("23:30", "2026-10-23"))).toEqual({ open: true, label: "Open now · closes 02:00 (after midnight)" });
    expect(openStatus(lateNight, sa("01:30", "2026-10-24"))?.open).toBe(true); // Saturday 01:30
    expect(openStatus(lateNight, sa("02:30", "2026-10-24"))?.open).toBe(false);
  });

  it("'Closed today' overrides hours until midnight", () => {
    const closedUntil = endOfSaDay(sa("10:00"));
    expect(openStatus(hours, sa("12:00"), closedUntil)).toEqual({ open: false, closedToday: true, label: "Closed today · opens 08:00 tomorrow" });
    // The next day it no longer applies.
    expect(openStatus(hours, sa("12:00", "2026-10-22"), closedUntil)?.open).toBe(true);
  });

  it("never guesses when no hours are set", () => {
    expect(openStatus([], sa("12:00"))).toBeNull();
  });
});

describe("weekSummary", () => {
  it("groups days with the same hours, Monday first", () => {
    expect(weekSummary([...weekdays8to8, satMorning])).toEqual([
      { days: "Mon–Fri", hours: "08:00–20:00" },
      { days: "Sat", hours: "09:00–14:00" },
      { days: "Sun", hours: "Closed" },
    ]);
  });
});

describe("hoursInputSchema", () => {
  const parse = (slots: { dayOfWeek: number; opens: string; closes: string }[], note = "") => hoursInputSchema.safeParse({ slots, note });

  it("accepts normal, split and overnight hours", () => {
    const r = parse([
      { dayOfWeek: 1, opens: "08:00", closes: "12:00" },
      { dayOfWeek: 1, opens: "14:00", closes: "20:00" },
      { dayOfWeek: 5, opens: "18:00", closes: "02:00" },
      { dayOfWeek: 6, opens: "09:00", closes: "00:00" },
    ], " Taking orders for tomorrow ");
    expect(r.success).toBe(true);
    expect(r.data?.slots.at(-1)).toEqual({ dayOfWeek: 6, opensAt: 540, closesAt: 1440 }); // 00:00 closing = midnight
    expect(r.data?.note).toBe("Taking orders for tomorrow");
  });

  it("rejects bad times, empty slots, overlaps and too many slots", () => {
    expect(parse([{ dayOfWeek: 1, opens: "8", closes: "20:00" }]).success).toBe(false);
    expect(parse([{ dayOfWeek: 1, opens: "08:00", closes: "08:00" }]).success).toBe(false);
    expect(parse([{ dayOfWeek: 1, opens: "08:00", closes: "13:00" }, { dayOfWeek: 1, opens: "12:00", closes: "20:00" }]).success).toBe(false);
    expect(parse([1, 2, 3].map(() => ({ dayOfWeek: 2, opens: "08:00", closes: "09:00" }))).success).toBe(false);
    expect(parse([{ dayOfWeek: 7, opens: "08:00", closes: "20:00" }]).success).toBe(false);
    expect(parse([], "x".repeat(81)).success).toBe(false);
  });
});
