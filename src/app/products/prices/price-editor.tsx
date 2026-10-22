"use client";

import { useActionState, useState } from "react";
import { FormError } from "@/components/auth-form";
import { useFormSubmit } from "@/components/use-form-submit";
import { AVAILABILITY_FOR_KIND, availabilityLabel, type AvailabilityValue } from "@/lib/storefront-rules";
import type { BulkState } from "../actions";

type Row = {
  id: string;
  name: string;
  kind: "PRODUCT" | "SERVICE";
  priceType: "FIXED" | "FROM" | "ON_REQUEST";
  price: string; // as typed, e.g. "35"
  availability: AvailabilityValue;
};

const field = "rounded-lg border border-ink-300 bg-white px-2 py-2 text-base";

// Every item on one screen: change prices and availability, mark things sold
// out, save once. Built for menus whose prices change from day to day.
export function PriceEditor({ action, items }: { action: (prev: BulkState, form: FormData) => Promise<BulkState>; items: Row[] }) {
  const [rows, setRows] = useState(items);
  const [state, dispatch, pending] = useActionState(action, {});
  const onSubmit = useFormSubmit(dispatch);
  const set = (id: string, change: Partial<Row>) => setRows(rows.map((r) => (r.id === id ? { ...r, ...change } : r)));
  const changed = rows.filter((r, i) => JSON.stringify(r) !== JSON.stringify(items[i])).length;

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="rows" value={JSON.stringify(rows.map(({ id, priceType, price, availability }) => ({ id, priceType, price, availability })))} />
      <ul className="space-y-3">
        {rows.map((r) => {
          const error = state.errors?.[r.id];
          const soldOut = r.availability === "OUT_OF_STOCK";
          return (
            <li key={r.id} className={`rounded-xl border bg-white p-3 ${error ? "border-red-400" : "border-ink-300/60"}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-ink-900">{r.name}</p>
                <label className="flex shrink-0 items-center gap-1.5 text-sm text-ink-700">
                  <input
                    type="checkbox"
                    checked={soldOut}
                    onChange={(e) =>
                      set(r.id, { availability: e.target.checked ? "OUT_OF_STOCK" : r.kind === "SERVICE" ? "BY_BOOKING" : "IN_STOCK" })
                    }
                    className="h-4 w-4 rounded border-ink-300 text-red-600"
                  />
                  {r.kind === "SERVICE" ? "Not taking bookings" : "Sold out"}
                </label>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select aria-label={`${r.name}: how it's priced`} value={r.priceType} onChange={(e) => set(r.id, { priceType: e.target.value as Row["priceType"] })} className={field}>
                  <option value="FIXED">Price</option>
                  <option value="FROM">From</option>
                  <option value="ON_REQUEST">On request</option>
                </select>
                {r.priceType !== "ON_REQUEST" && (
                  <label className="flex items-center gap-1 text-ink-700">
                    <span aria-hidden>R</span>
                    <input
                      aria-label={`${r.name}: price in rand`}
                      inputMode="decimal"
                      value={r.price}
                      onChange={(e) => set(r.id, { price: e.target.value })}
                      className={`${field} w-24`}
                    />
                  </label>
                )}
                <select
                  aria-label={`${r.name}: availability`}
                  value={r.availability}
                  onChange={(e) => set(r.id, { availability: e.target.value as AvailabilityValue })}
                  className={`${field} min-w-0 flex-1`}
                >
                  {AVAILABILITY_FOR_KIND[r.kind].map((a) => (
                    <option key={a} value={a}>
                      {availabilityLabel(a, r.kind)}
                    </option>
                  ))}
                </select>
              </div>
              {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
            </li>
          );
        })}
      </ul>
      <div className="sticky bottom-0 -mx-4 space-y-2 border-t border-ink-300/60 bg-ink-100/95 px-4 py-3 backdrop-blur">
        <FormError message={state.formError} />
        {state.saved !== undefined && !pending && changed === 0 && (
          <p role="status" className="text-sm text-brand-700">
            {state.saved === 0 ? "Nothing to save." : `Saved ${state.saved} ${state.saved === 1 ? "item" : "items"}.`}
          </p>
        )}
        <button type="submit" disabled={pending} className="w-full rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-60 sm:w-auto">
          {pending ? "Saving…" : changed ? `Save ${changed} ${changed === 1 ? "change" : "changes"}` : "Save"}
        </button>
      </div>
    </form>
  );
}
