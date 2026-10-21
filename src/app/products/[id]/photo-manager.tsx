"use client";

import { useActionState, useState } from "react";
import { FormError } from "@/components/auth-form";
import { Photo, type PhotoData } from "@/components/photo";
import { useFormSubmit } from "@/components/use-form-submit";
import type { PhotoActionState } from "./photo-actions";

type Action = () => Promise<PhotoActionState>;

const smallButton =
  "rounded-md border border-ink-300 px-2 py-1 text-xs font-medium text-ink-700 hover:bg-ink-100 disabled:opacity-50";

function ActionButton({ action, label, ariaLabel }: { action: Action; label: string; ariaLabel: string }) {
  const [state, run, pending] = useActionState(action, {});
  return (
    <form action={run}>
      <button type="submit" disabled={pending} aria-label={ariaLabel} className={smallButton}>
        {label}
      </button>
      {state.formError && <span className="mt-1 block text-xs text-red-600">{state.formError}</span>}
    </form>
  );
}

export function PhotoCard({
  photo,
  index,
  count,
  itemName,
  remove,
  makeMain,
  earlier,
  later,
  saveAlt,
}: {
  photo: PhotoData & { id: string };
  index: number;
  count: number;
  itemName: string;
  remove: Action;
  makeMain: Action;
  earlier: Action;
  later: Action;
  saveAlt: (prev: PhotoActionState, form: FormData) => Promise<PhotoActionState>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [removeState, runRemove, removing] = useActionState(remove, {});
  const [altState, dispatchAlt, savingAlt] = useActionState(saveAlt, {});
  const onAltSubmit = useFormSubmit(dispatchAlt);
  const n = index + 1;

  return (
    <li className="flex overflow-hidden rounded-xl border border-ink-300/60 bg-white sm:block">
      <div className="relative aspect-square w-28 shrink-0 bg-ink-100 sm:w-full">
        <Photo photo={photo} alt={`${itemName}, photo ${n}`} sizes="(min-width: 640px) 200px, 112px" className="h-full w-full object-cover" />
        {index === 0 && (
          <span className="absolute left-2 top-2 rounded-full bg-ink-900/80 px-2 py-0.5 text-xs font-medium text-white">Main photo</span>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2 p-3">
        <div className="flex flex-wrap gap-1.5">
          {index > 0 && <ActionButton action={makeMain} label="Make main" ariaLabel={`Make photo ${n} the main photo`} />}
          {index > 0 && <ActionButton action={earlier} label="←" ariaLabel={`Move photo ${n} earlier`} />}
          {index < count - 1 && <ActionButton action={later} label="→" ariaLabel={`Move photo ${n} later`} />}
        </div>

        <form onSubmit={onAltSubmit} className="space-y-1">
          <label htmlFor={`alt-${photo.id}`} className="block text-xs font-medium text-ink-700">
            Description <span className="font-normal text-ink-500">(optional, read aloud to blind visitors)</span>
          </label>
          <div className="flex gap-1.5">
            <input
              id={`alt-${photo.id}`}
              name="altText"
              defaultValue={photo.altText ?? ""}
              maxLength={200}
              placeholder="e.g. Knotless braids, waist length"
              className="min-w-0 flex-1 rounded-md border border-ink-300 px-2 py-1 text-sm"
            />
            <button type="submit" disabled={savingAlt} className={smallButton}>
              {savingAlt ? "…" : "Save"}
            </button>
          </div>
          {altState.saved && <p className="text-xs text-brand-700">Saved.</p>}
          <FormError message={altState.formError} />
        </form>

        {confirming ? (
          <form action={runRemove} className="space-y-1.5 rounded-lg bg-red-50 p-2">
            <p className="text-xs text-red-800">Remove this photo? It will be deleted.</p>
            <div className="flex gap-1.5">
              <button type="submit" disabled={removing} className="rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60">
                {removing ? "Removing…" : "Yes, remove"}
              </button>
              <button type="button" onClick={() => setConfirming(false)} className={smallButton}>
                Cancel
              </button>
            </div>
            <FormError message={removeState.formError} />
          </form>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="text-xs font-medium text-red-700 hover:underline">
            Remove photo {n}
          </button>
        )}
      </div>
    </li>
  );
}
