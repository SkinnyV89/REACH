import { z } from "zod";

// Opening hours, in South African time (UTC+2 all year: no daylight saving).
// Pure and shared by the browser and the server.

export type Slot = { dayOfWeek: number; opensAt: number; closesAt: number }; // minutes after midnight

export const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
// Monday first, as people read a week.
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export const MAX_SLOTS_PER_DAY = 2;
export const HOURS_NOTE_MAX = 80;

const SA_OFFSET_MS = 2 * 3600_000;
const DAY_MINUTES = 1440;

// The South African weekday and minute for a moment.
export function saClock(now: Date): { day: number; minute: number } {
  const t = new Date(now.getTime() + SA_OFFSET_MS);
  return { day: t.getUTCDay(), minute: t.getUTCHours() * 60 + t.getUTCMinutes() };
}

// Midnight at the end of today, South African time ("Closed today").
export function endOfSaDay(now: Date): Date {
  const t = new Date(now.getTime() + SA_OFFSET_MS);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1) - SA_OFFSET_MS);
}

export function parseTime(raw: string): number | null {
  const m = /^([01]\d|2[0-4]):([0-5]\d)$/.exec(raw.trim());
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return minutes <= DAY_MINUTES ? minutes : null;
}

export function formatTime(minutes: number): string {
  if (minutes === DAY_MINUTES || minutes === 0) return minutes === 0 ? "00:00" : "midnight";
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

const overnight = (s: Slot) => s.closesAt < s.opensAt;

// Is a slot open at (day, minute)? Overnight slots run into the next day.
function slotOpenAt(s: Slot, day: number, minute: number): boolean {
  if (s.dayOfWeek === day && minute >= s.opensAt && (overnight(s) || minute < s.closesAt)) return true;
  const yesterday = (day + 6) % 7;
  return s.dayOfWeek === yesterday && overnight(s) && minute < s.closesAt;
}

export type OpenStatus =
  | { open: true; label: string }
  | { open: false; label: string; closedToday: boolean };

// "Open now · closes 20:00" / "Closed · opens 08:00 tomorrow". Null when the
// seller hasn't set hours (we never guess).
export function openStatus(slots: Slot[], now: Date, closedUntil: Date | null = null): OpenStatus | null {
  if (slots.length === 0) return null;
  const { day, minute } = saClock(now);
  const closedToday = Boolean(closedUntil && closedUntil > now);

  if (!closedToday) {
    const current = slots.find((s) => slotOpenAt(s, day, minute));
    if (current) {
      const closesSameDay = current.dayOfWeek === day && !overnight(current);
      return { open: true, label: `Open now · closes ${formatTime(current.closesAt)}${closesSameDay ? "" : " (after midnight)"}` };
    }
  }

  // Next opening within the coming week. "Closed today" lasts until the end
  // of the day, so then the search starts tomorrow.
  for (let ahead = closedToday ? 1 : 0; ahead <= 7; ahead++) {
    const d = (day + ahead) % 7;
    const next = slots
      .filter((s) => s.dayOfWeek === d && (ahead > 0 || s.opensAt > minute))
      .sort((a, b) => a.opensAt - b.opensAt)[0];
    if (next) {
      const when = ahead === 0 ? "today" : ahead === 1 ? "tomorrow" : DAYS_SHORT[d];
      return { open: false, closedToday, label: `${closedToday ? "Closed today" : "Closed"} · opens ${formatTime(next.opensAt)} ${when}` };
    }
  }
  return { open: false, closedToday, label: closedToday ? "Closed today" : "Closed" };
}

// "Mon–Fri 08:00–20:00", "Sat 09:00–14:00", "Sun closed": consecutive days
// with the same hours are grouped.
export function weekSummary(slots: Slot[]): { days: string; hours: string }[] {
  const byDay = new Map<number, string>();
  for (const d of WEEK_ORDER) {
    const list = slots.filter((s) => s.dayOfWeek === d).sort((a, b) => a.opensAt - b.opensAt);
    byDay.set(d, list.length ? list.map((s) => `${formatTime(s.opensAt)}–${formatTime(s.closesAt)}`).join(", ") : "Closed");
  }
  const rows: { days: string; hours: string }[] = [];
  let runStart = 0;
  for (let i = 1; i <= WEEK_ORDER.length; i++) {
    const prev = byDay.get(WEEK_ORDER[i - 1])!;
    if (i < WEEK_ORDER.length && byDay.get(WEEK_ORDER[i]) === prev) continue;
    const first = DAYS_SHORT[WEEK_ORDER[runStart]];
    const last = DAYS_SHORT[WEEK_ORDER[i - 1]];
    rows.push({ days: runStart === i - 1 ? first : `${first}–${last}`, hours: prev });
    runStart = i;
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Form input
// ---------------------------------------------------------------------------

const slotInput = z
  .object({ dayOfWeek: z.number().int().min(0).max(6), opens: z.string(), closes: z.string() })
  .transform((s, ctx) => {
    const opensAt = parseTime(s.opens);
    const closesAt = parseTime(s.closes);
    if (opensAt === null || closesAt === null || opensAt === DAY_MINUTES) {
      ctx.addIssue({ code: "custom", message: `Use times like 08:00 for ${DAYS[s.dayOfWeek]}.`, path: ["hours"] });
      return z.NEVER;
    }
    if (opensAt === closesAt || (closesAt === 0 && opensAt === 0)) {
      ctx.addIssue({ code: "custom", message: `${DAYS[s.dayOfWeek]}: opening and closing times are the same.`, path: ["hours"] });
      return z.NEVER;
    }
    return { dayOfWeek: s.dayOfWeek, opensAt, closesAt: closesAt === 0 ? DAY_MINUTES : closesAt };
  });

export const hoursInputSchema = z.object({
  slots: z
    .array(slotInput)
    .max(7 * MAX_SLOTS_PER_DAY)
    .superRefine((slots, ctx) => {
      for (const d of WEEK_ORDER) {
        const day = slots.filter((s) => s.dayOfWeek === d);
        if (day.length > MAX_SLOTS_PER_DAY) ctx.addIssue({ code: "custom", message: `Up to ${MAX_SLOTS_PER_DAY} time slots per day.`, path: ["hours"] });
        const [a, b] = day;
        if (a && b && !overnight(a) && !overnight(b) && a.opensAt < b.closesAt && b.opensAt < a.closesAt) {
          ctx.addIssue({ code: "custom", message: `${DAYS[d]}: the two time slots overlap.`, path: ["hours"] });
        }
      }
    }),
  note: z
    .string()
    .trim()
    .max(HOURS_NOTE_MAX, `Keep the note under ${HOURS_NOTE_MAX} characters.`)
    .transform((v) => (v === "" ? null : v)),
});

export type HoursInput = z.infer<typeof hoursInputSchema>;
