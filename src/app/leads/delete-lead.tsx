"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteLeadAction } from "./actions";

// Two-step delete: the first tap asks, the second deletes. Deletion is
// permanent, so the confirmation says so.
export function DeleteLeadButton({ leadId, leadName }: { leadId: string; leadName: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function remove() {
    setError(undefined);
    startTransition(async () => {
      const result = await deleteLeadAction(leadId);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-lg px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50"
      >
        Delete
      </button>
    );
  }

  return (
    <div role="group" aria-label={`Delete ${leadName}`} className="flex flex-wrap items-center gap-2 rounded-lg bg-red-50 px-3 py-2">
      <p className="text-sm text-red-900">Delete {leadName}&apos;s details permanently? This can&apos;t be undone.</p>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
      >
        {pending ? "Deleting…" : "Yes, delete"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={pending}
        className="rounded-lg px-3 py-1.5 text-sm font-semibold text-ink-700 hover:bg-white"
      >
        Cancel
      </button>
      {error && <p className="w-full text-sm text-red-700">{error}</p>}
    </div>
  );
}
