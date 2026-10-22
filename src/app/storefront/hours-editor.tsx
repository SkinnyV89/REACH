"use client";

import { useActionState, useState } from "react";
import { FormError } from "@/components/auth-form";
import { useFormSubmit } from "@/components/use-form-submit";
import { DAYS, HOURS_NOTE_MAX, MAX_SLOTS_PER_DAY, WEEK_ORDER, formatTime, type Slot } from "@/lib/hours-rules";
import type { StorefrontFormState } from "./actions";

type DayState = { open: boolean; slots: { opens: string; closes: string }[] };

const toInput = (m: number) => (m === 1440 ? "00:00" : formatTime(m));

function initialDays(slots: Slot[]): DayState[] {
  return Array.from({ length: 7 }, (_, d) => {
    const mine = slots.filter((s) => s.dayOfWeek === d);
    return mine.length
      ? { open: true, slots: mine.map((s) => ({ opens: toInput(s.opensAt), closes: toInput(s.closesAt) })) }
      : { open: false, slots: [{ opens: "08:00", closes: "20:00" }] };
  });
}

// Weekly hours: tick the days you're open, set times (two slots a day for a
// lunch break), copy Monday to the other weekdays in one tap.
export function HoursEditor({
  action,
  slots,
  note,
}: {
  action: (prev: StorefrontFormState, form: FormData) => Promise<StorefrontFormState>;
  slots: Slot[];
  note: string;
}) {
  const [days, setDays] = useState<DayState[]>(() => initialDays(slots));
  const [state, dispatch, pending] = useActionState(action, {});
  const onSubmit = useFormSubmit(dispatch);

  const update = (d: number, change: (day: DayState) => DayState) => setDays(days.map((day, i) => (i === d ? change(day) : day)));
  const payload = JSON.stringify(
    days.flatMap((day, d) => (day.open ? day.slots.map((s) => ({ dayOfWeek: d, opens: s.opens, closes: s.closes })) : [])),
  );

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="slots" value={payload} />
      <ul className="divide-y divide-ink-100 rounded-xl border border-ink-300/60">
        {WEEK_ORDER.map((d) => {
          const day = days[d];
          return (
            <li key={d} className="flex flex-wrap items-start gap-x-3 gap-y-2 px-3 py-2.5">
              <label className="flex w-32 items-center gap-2 pt-1.5 text-sm font-medium text-ink-900">
                <input
                  type="checkbox"
                  checked={day.open}
                  onChange={(e) => update(d, (x) => ({ ...x, open: e.target.checked }))}
                  className="h-4 w-4 rounded border-ink-300 text-brand-600"
                />
                {DAYS[d]}
              </label>
              {day.open ? (
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  {day.slots.map((s, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                      <input
                        type="time"
                        aria-label={`${DAYS[d]} opens`}
                        value={s.opens}
                        onChange={(e) => update(d, (x) => ({ ...x, slots: x.slots.map((y, j) => (j === i ? { ...y, opens: e.target.value } : y)) }))}
                        className="rounded-lg border border-ink-300 px-2 py-1.5"
                      />
                      <span className="text-ink-500">to</span>
                      <input
                        type="time"
                        aria-label={`${DAYS[d]} closes`}
                        value={s.closes}
                        onChange={(e) => update(d, (x) => ({ ...x, slots: x.slots.map((y, j) => (j === i ? { ...y, closes: e.target.value } : y)) }))}
                        className="rounded-lg border border-ink-300 px-2 py-1.5"
                      />
                      {i > 0 && (
                        <button
                          type="button"
                          onClick={() => update(d, (x) => ({ ...x, slots: x.slots.filter((_, j) => j !== i) }))}
                          className="text-xs font-medium text-red-700 hover:underline"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                  {day.slots.length < MAX_SLOTS_PER_DAY && (
                    <button
                      type="button"
                      onClick={() => update(d, (x) => ({ ...x, slots: [...x.slots, { opens: "14:00", closes: "20:00" }] }))}
                      className="self-start text-xs font-medium text-brand-700 hover:underline"
                    >
                      + Add another time (e.g. after a break)
                    </button>
                  )}
                </div>
              ) : (
                <span className="pt-1.5 text-sm text-ink-500">Closed</span>
              )}
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        onClick={() => setDays(days.map((day, d) => (d >= 2 && d <= 5 ? { open: days[1].open, slots: days[1].slots.map((s) => ({ ...s })) } : day)))}
        className="text-sm font-medium text-brand-700 hover:underline"
      >
        Copy Monday&apos;s hours to Tuesday–Friday
      </button>
      <p className="text-xs text-ink-500">Open past midnight? Set a closing time earlier than the opening time, e.g. 18:00 to 02:00.</p>
      <div>
        <label htmlFor="note" className="block text-sm font-medium text-ink-900">
          Note <span className="font-normal text-ink-500">(optional)</span>
        </label>
        <input
          id="note"
          name="note"
          defaultValue={note}
          maxLength={HOURS_NOTE_MAX}
          placeholder="e.g. Taking orders for tomorrow until 20:00"
          className="mt-1 block w-full rounded-lg border border-ink-300 px-3 py-2 text-base"
        />
      </div>
      <FormError message={state.formError} />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-lg bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
          {pending ? "Saving…" : "Save hours"}
        </button>
        {state.saved && !pending && (
          <p role="status" className="text-sm text-brand-700">
            Hours saved.
          </p>
        )}
      </div>
    </form>
  );
}

// One tap: closed for the rest of today (until midnight), or open again.
export function ClosedTodayButton({ closedToday, action }: { closedToday: boolean; action: () => Promise<StorefrontFormState> }) {
  const [state, run, pending] = useActionState(action, {});
  return (
    <form action={run} className="space-y-1">
      <button
        type="submit"
        disabled={pending}
        className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-60 ${
          closedToday ? "bg-brand-600 text-white hover:bg-brand-700" : "border border-ink-300 text-ink-700 hover:bg-ink-100"
        }`}
      >
        {pending ? "Please wait…" : closedToday ? "Open again today" : "Closed for today"}
      </button>
      <FormError message={state.formError} />
    </form>
  );
}
