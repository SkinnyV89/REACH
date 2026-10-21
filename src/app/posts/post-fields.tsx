"use client";

import { useState } from "react";
import { TextArea } from "@/components/form-controls";
import { CAPTION_MAX, CONTACT_IN_CAPTION_MESSAGE, MAX_POST_TAGS, captionContactProblem, groupThousands } from "@/lib/post-rules";

export type TaggableProduct = { id: string; name: string; kind: "PRODUCT" | "SERVICE" };

// Caption and item tags, shared by the new-post screen and the post editor.
// Checks run as the seller types; the server checks again on save.
export function PostFields({
  products,
  initial,
  errors,
}: {
  products: TaggableProduct[];
  initial: { caption: string; productIds: string[] };
  errors?: Record<string, string | undefined>;
}) {
  const [caption, setCaption] = useState(initial.caption);
  const [tags, setTags] = useState<string[]>(initial.productIds);
  const contactProblem = captionContactProblem(caption) !== null;
  const over = caption.length > CAPTION_MAX;
  // A server error describes what was submitted; once the seller edits the
  // field, only the live checks apply.
  const serverCaptionError = caption === initial.caption ? errors?.caption : undefined;
  const serverTagError = JSON.stringify(tags) === JSON.stringify(initial.productIds) ? errors?.productIds : undefined;
  const captionError =
    (contactProblem ? CONTACT_IN_CAPTION_MESSAGE : over ? `Keep the caption under ${groupThousands(CAPTION_MAX)} characters.` : undefined) ??
    serverCaptionError;

  return (
    <div className="space-y-5">
      <div>
        <TextArea
          id="caption"
          label="Caption"
          optional
          rows={4}
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="What did you make or do? e.g. Waist-length knotless braids for a client in Pimville, done in 6 hours."
          error={captionError}
        />
        <p className={`mt-1 text-right text-xs ${over ? "text-red-600" : "text-ink-500"}`} aria-live="polite">
          {groupThousands(caption.length)} / {groupThousands(CAPTION_MAX)}
        </p>
      </div>

      <fieldset>
        <legend className="block text-sm font-medium text-ink-900">
          Tag items <span className="font-normal text-ink-500">(optional, up to {MAX_POST_TAGS})</span>
        </legend>
        <p className="mt-0.5 text-sm text-ink-500">Buyers can tap a tag to see that item.</p>
        {products.length === 0 ? (
          <p className="mt-2 text-sm text-ink-700">You haven&apos;t listed any products or services yet.</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {products.map((p) => {
              const checked = tags.includes(p.id);
              const disabled = !checked && tags.length >= MAX_POST_TAGS;
              return (
                <li key={p.id}>
                  <label
                    className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${
                      checked ? "border-brand-600 bg-brand-50 text-brand-900" : "border-ink-300 bg-white text-ink-700"
                    } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
                  >
                    <input
                      type="checkbox"
                      name="productIds"
                      value={p.id}
                      checked={checked}
                      disabled={disabled}
                      onChange={(e) => setTags(e.target.checked ? [...tags, p.id] : tags.filter((t) => t !== p.id))}
                      className="h-4 w-4 rounded border-ink-300 text-brand-600"
                    />
                    {p.name}
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {serverTagError && <p className="mt-1 text-sm text-red-600">{serverTagError}</p>}
      </fieldset>
    </div>
  );
}
