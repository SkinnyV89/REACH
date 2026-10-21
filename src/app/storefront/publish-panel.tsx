"use client";

import { useActionState } from "react";
import { FormError } from "@/components/auth-form";
import type { StorefrontFormState } from "./actions";

export function PublishToggle({
  action: serverAction,
  published,
  ready,
}: {
  action: () => Promise<StorefrontFormState>;
  published: boolean;
  ready: boolean;
}) {
  const [state, action, pending] = useActionState(serverAction, {});
  return (
    <form action={action} className="space-y-2">
      <FormError message={state.formError} />
      <button
        type="submit"
        disabled={pending || (!published && !ready)}
        className={`w-full rounded-lg px-4 py-2.5 font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
          published ? "border border-ink-300 text-ink-700 hover:bg-ink-100" : "bg-brand-600 text-white hover:bg-brand-700"
        }`}
      >
        {pending ? "Please wait…" : published ? "Unpublish storefront" : "Publish storefront"}
      </button>
    </form>
  );
}
