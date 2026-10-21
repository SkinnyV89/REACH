"use client";

import { useActionState } from "react";
import { FormError } from "@/components/auth-form";
import type { ProductFormState } from "./actions";

export function ArchiveButton({
  action: serverAction,
  archived,
}: {
  action: () => Promise<ProductFormState>;
  archived: boolean;
}) {
  const [state, action, pending] = useActionState(serverAction, {});
  return (
    <form action={action} className="space-y-2">
      <FormError message={state.formError} />
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg border border-ink-300 px-4 py-2.5 text-sm font-semibold text-ink-700 transition hover:bg-ink-100 disabled:opacity-60 sm:w-auto"
      >
        {pending ? "Please wait…" : archived ? "Restore" : "Archive"}
      </button>
    </form>
  );
}
