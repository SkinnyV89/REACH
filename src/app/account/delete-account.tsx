"use client";

import { useActionState, useState } from "react";
import { FormError } from "@/components/auth-form";
import { deleteAccountAction } from "./actions";

export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [state, run, pending] = useActionState(deleteAccountAction, {});
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-sm font-semibold text-red-700 hover:underline">
        Delete my account
      </button>
    );
  }
  return (
    <form action={run} className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4">
      <p className="text-sm text-red-900">
        This permanently deletes your account, the sellers you follow and your notifications. It can&apos;t be undone.
      </p>
      <label className="block text-sm font-medium text-red-900">
        Type DELETE to confirm
        <input
          name="confirm"
          autoComplete="off"
          className="mt-1 block w-full rounded-lg border border-red-300 px-3 py-2 text-base text-ink-900"
        />
      </label>
      <FormError message={state.error} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
          {pending ? "Deleting…" : "Delete my account"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-ink-300 bg-white px-4 py-2 text-sm font-medium text-ink-700">
          Cancel
        </button>
      </div>
    </form>
  );
}
