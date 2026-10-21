"use client";

import { useActionState, useState } from "react";
import { FormError } from "@/components/auth-form";
import { useFormSubmit } from "@/components/use-form-submit";
import type { PostFormState } from "../actions";
import { PostFields, type TaggableProduct } from "../post-fields";

type Action = () => Promise<PostFormState>;

export function PostEditForm({
  action,
  products,
  initial,
}: {
  action: (prev: PostFormState, form: FormData) => Promise<PostFormState>;
  products: TaggableProduct[];
  initial: { caption: string; productIds: string[] };
}) {
  const [state, dispatch, pending] = useActionState(action, {});
  const onSubmit = useFormSubmit(dispatch);
  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <PostFields products={products} initial={state.values ?? initial} errors={state.errors} />
      <FormError message={state.formError} />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        {state.saved && !pending && (
          <p role="status" className="text-sm text-brand-700">
            Saved.
          </p>
        )}
      </div>
    </form>
  );
}

// One-tap action (publish, hide, show again).
export function ActionButton({ action, label, pendingLabel, primary = false, disabled = false }: { action: Action; label: string; pendingLabel: string; primary?: boolean; disabled?: boolean }) {
  const [state, run, pending] = useActionState(action, {});
  return (
    <form action={run} className="space-y-2">
      <button
        type="submit"
        disabled={pending || disabled}
        className={
          primary
            ? "w-full rounded-lg bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-60 sm:w-auto"
            : "w-full rounded-lg border border-ink-300 px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-100 disabled:opacity-60 sm:w-auto"
        }
      >
        {pending ? pendingLabel : label}
      </button>
      <FormError message={state.formError} />
    </form>
  );
}

// Two-step destructive action (delete post, remove photo).
export function ConfirmButton({ action, label, question, confirmLabel, small = false }: { action: Action; label: string; question: string; confirmLabel: string; small?: boolean }) {
  const [confirming, setConfirming] = useState(false);
  const [state, run, pending] = useActionState(action, {});
  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className={`${small ? "text-xs" : "text-sm"} font-medium text-red-700 hover:underline`}>
        {label}
      </button>
    );
  }
  return (
    <form action={run} className="space-y-1.5 rounded-lg bg-red-50 p-2">
      <p className="text-xs text-red-800">{question}</p>
      <div className="flex flex-wrap gap-1.5">
        <button type="submit" disabled={pending} className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60">
          {pending ? "Please wait…" : confirmLabel}
        </button>
        <button type="button" onClick={() => setConfirming(false)} className="rounded-md border border-ink-300 px-2.5 py-1 text-xs font-medium text-ink-700">
          Cancel
        </button>
      </div>
      <FormError message={state.formError} />
    </form>
  );
}
