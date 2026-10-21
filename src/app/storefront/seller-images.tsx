"use client";

import { useActionState, useState } from "react";
import { FormError } from "@/components/auth-form";
import { Photo, type PhotoData } from "@/components/photo";
import { PhotoUpload } from "@/components/photo-upload";
import type { StorefrontFormState } from "./actions";

// Logo or cover photo: preview, upload/replace and a two-step remove.
export function SellerImageField({
  target,
  title,
  hint,
  photo,
  businessName,
  remove,
  uploadsOff,
}: {
  target: "logo" | "cover";
  title: string;
  hint: string;
  photo: PhotoData | null;
  businessName: string;
  remove: () => Promise<StorefrontFormState>;
  uploadsOff: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [state, run, pending] = useActionState(remove, {});
  const isLogo = target === "logo";

  return (
    <div data-image-field={target}>
      <h3 className="font-medium text-ink-900">{title}</h3>
      <p className="mt-0.5 text-sm text-ink-500">{hint}</p>
      <div className="mt-3">
        {photo ? (
          <Photo
            photo={photo}
            kind={target}
            alt={isLogo ? `${businessName} logo` : `${businessName} cover photo`}
            sizes="(min-width: 768px) 400px, 100vw"
            className={isLogo ? "h-20 w-20 rounded-full object-cover" : "aspect-[3/1] w-full rounded-xl object-cover"}
          />
        ) : (
          <div
            className={`flex items-center justify-center border border-dashed border-ink-300 bg-ink-100 text-xs text-ink-500 ${
              isLogo ? "h-20 w-20 rounded-full" : "aspect-[3/1] w-full rounded-xl"
            }`}
          >
            {isLogo ? "No logo" : "No cover photo"}
          </div>
        )}
      </div>
      <div className="mt-3 space-y-2">
        <PhotoUpload
          target={target}
          label={photo ? `Replace ${isLogo ? "logo" : "cover photo"}` : `Add ${isLogo ? "a logo" : "a cover photo"}`}
          disabledText={uploadsOff ? "Photo uploads aren't set up on this server yet." : undefined}
        />
        {photo &&
          (confirming ? (
            <form action={run} className="flex flex-wrap items-center gap-2 rounded-lg bg-red-50 p-2 text-sm">
              <span className="text-red-800">Remove it? It will be deleted.</span>
              <button type="submit" disabled={pending} className="rounded-md bg-red-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-60">
                {pending ? "Removing…" : "Yes, remove"}
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="rounded-md border border-ink-300 px-2 py-1 text-xs font-medium text-ink-700">
                Cancel
              </button>
            </form>
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className="text-sm font-medium text-red-700 hover:underline">
              Remove {isLogo ? "logo" : "cover photo"}
            </button>
          ))}
        <FormError message={state.formError} />
      </div>
    </div>
  );
}
