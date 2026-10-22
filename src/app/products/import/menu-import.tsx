"use client";

import { useActionState, useState } from "react";
import { FormError } from "@/components/auth-form";
import { preparePhoto } from "@/components/photo-upload";
import { useFormSubmit } from "@/components/use-form-submit";
import { ACCEPT_ATTRIBUTE } from "@/lib/media-rules";
import type { DraftItem, MenuDraft } from "@/lib/menu-import-rules";
import { AVAILABILITY_FOR_KIND, availabilityLabel, defaultAvailability, type AvailabilityValue } from "@/lib/storefront-rules";
import type { ImportState } from "../actions";

type Row = DraftItem & { keep: boolean; categoryId: string; availability: AvailabilityValue };

const field = "rounded-lg border border-ink-300 bg-white px-2 py-2 text-base";

// Photo → REACH reads it → the seller checks every item → save. The draft
// lives only in this page until the seller saves it.
export function MenuImport({
  action,
  categories,
  room,
}: {
  action: (prev: ImportState, form: FormData) => Promise<ImportState>;
  categories: { id: string; name: string }[];
  room: number;
}) {
  const [phase, setPhase] = useState<"pick" | "reading" | "review">("pick");
  const [readError, setReadError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [state, dispatch, pending] = useActionState(action, {});
  const onSubmit = useFormSubmit(dispatch);

  async function read(file: File) {
    setReadError(null);
    setPhase("reading");
    try {
      const blob = await preparePhoto(file, "post");
      const form = new FormData();
      form.set("file", blob, "flyer.jpg");
      const res = await fetch("/api/menu-import", { method: "POST", body: form });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; draft?: MenuDraft; message?: string } | null;
      if (!res.ok || !body?.ok || !body.draft) throw new Error(body?.message ?? "We couldn't read that photo. Try again.");
      setWarnings(body.draft.warnings);
      setRows(
        body.draft.items.map((item) => ({ ...item, keep: true, categoryId: categories[0].id, availability: defaultAvailability(item.kind) })),
      );
      setPhase(body.draft.items.length ? "review" : "pick");
      if (!body.draft.items.length) setReadError(body.draft.warnings[0] ?? "We couldn't find any items on that photo.");
    } catch (error) {
      setReadError(error instanceof Error ? error.message : "We couldn't read that photo. Try again.");
      setPhase("pick");
    }
  }

  if (phase !== "review") {
    return (
      <div className="space-y-3 rounded-xl bg-white p-5">
        <label className="block">
          <span className="block text-sm font-medium text-ink-900">Photo of your flyer or price list</span>
          <input
            type="file"
            accept={ACCEPT_ATTRIBUTE}
            disabled={phase === "reading"}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void read(file);
            }}
            className="mt-2 block w-full text-sm text-ink-700 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-4 file:py-2.5 file:font-semibold file:text-white"
          />
        </label>
        {phase === "reading" && (
          <p role="status" className="text-sm text-ink-900">
            Reading your flyer… this can take up to a minute.
          </p>
        )}
        {readError && (
          <p role="alert" className="text-sm text-red-700">
            {readError}
          </p>
        )}
        <p className="text-xs text-ink-500">Tip: a straight, well-lit photo where every price is readable works best.</p>
      </div>
    );
  }

  const set = (i: number, change: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...change } : r)));
  const kept = rows.map((r, i) => ({ r, i })).filter(({ r }) => r.keep);
  // Errors come back keyed by position among the ticked rows.
  const errorFor = (i: number) => state.errors?.[kept.findIndex((k) => k.i === i)];
  const payload = JSON.stringify(
    kept.map(({ r }) => ({
      name: r.name,
      kind: r.kind,
      categoryId: r.categoryId,
      priceType: r.priceType,
      price: r.price,
      description: r.description,
      availability: r.availability,
    })),
  );
  const tooMany = kept.length > room;

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <input type="hidden" name="rows" value={payload} />
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p className="font-semibold">Check every item before saving.</p>
        <p>REACH read these from your photo and can make mistakes, especially with prices.</p>
        {warnings.length > 0 && (
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
      </div>

      {categories.length > 1 && (
        <label className="flex flex-wrap items-center gap-2 text-sm text-ink-900">
          Put all items under
          <select
            aria-label="Category for all items"
            onChange={(e) => setRows(rows.map((r) => ({ ...r, categoryId: e.target.value })))}
            defaultValue={categories[0].id}
            className={field}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <ul className="space-y-3">
        {rows.map((r, i) => {
          const error = r.keep ? errorFor(i) : undefined;
          return (
            <li key={i} className={`rounded-xl border bg-white p-3 ${error ? "border-red-400" : "border-ink-300/60"} ${r.keep ? "" : "opacity-60"}`}>
              <div className="flex items-start gap-2">
                <input
                  type="checkbox"
                  aria-label={`Add ${r.name}`}
                  checked={r.keep}
                  onChange={(e) => set(i, { keep: e.target.checked })}
                  className="mt-3 h-5 w-5 shrink-0 rounded border-ink-300 text-brand-600"
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <input aria-label="Name" value={r.name} maxLength={100} onChange={(e) => set(i, { name: e.target.value })} className={`${field} w-full font-semibold`} />
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label={`${r.name}: product or service`}
                      value={r.kind}
                      onChange={(e) => {
                        const kind = e.target.value as Row["kind"];
                        set(i, { kind, availability: defaultAvailability(kind) });
                      }}
                      className={field}
                    >
                      <option value="PRODUCT">Product</option>
                      <option value="SERVICE">Service</option>
                    </select>
                    <select aria-label={`${r.name}: how it's priced`} value={r.priceType} onChange={(e) => set(i, { priceType: e.target.value as Row["priceType"] })} className={field}>
                      <option value="FIXED">Price</option>
                      <option value="FROM">From</option>
                      <option value="ON_REQUEST">On request</option>
                    </select>
                    {r.priceType !== "ON_REQUEST" && (
                      <label className="flex items-center gap-1 text-ink-700">
                        <span aria-hidden>R</span>
                        <input aria-label={`${r.name}: price in rand`} inputMode="decimal" value={r.price} onChange={(e) => set(i, { price: e.target.value })} className={`${field} w-24`} />
                      </label>
                    )}
                    <select
                      aria-label={`${r.name}: availability`}
                      value={r.availability}
                      onChange={(e) => set(i, { availability: e.target.value as AvailabilityValue })}
                      className={`${field} min-w-0 flex-1`}
                    >
                      {AVAILABILITY_FOR_KIND[r.kind].map((a) => (
                        <option key={a} value={a}>
                          {availabilityLabel(a, r.kind)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <input
                    aria-label={`${r.name}: description`}
                    placeholder="Description (optional)"
                    value={r.description}
                    maxLength={1000}
                    onChange={(e) => set(i, { description: e.target.value })}
                    className={`${field} w-full text-sm`}
                  />
                  {categories.length > 1 && (
                    <select aria-label={`${r.name}: category`} value={r.categoryId} onChange={(e) => set(i, { categoryId: e.target.value })} className={`${field} text-sm`}>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                  {error && <p className="text-sm text-red-600">{error}</p>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {tooMany && <p className="text-sm text-red-700">You have room for {room} more items. Untick some to continue.</p>}
      <FormError message={state.formError} />
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-ink-300/60 bg-ink-100/95 px-4 py-3 backdrop-blur">
        <button
          type="submit"
          disabled={pending || kept.length === 0 || tooMany}
          className="rounded-lg bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : `Add ${kept.length} ${kept.length === 1 ? "item" : "items"}`}
        </button>
        <button
          type="button"
          onClick={() => {
            setRows([]);
            setWarnings([]);
            setPhase("pick");
          }}
          className="text-sm font-medium text-ink-700 hover:underline"
        >
          Start again with another photo
        </button>
      </div>
    </form>
  );
}
