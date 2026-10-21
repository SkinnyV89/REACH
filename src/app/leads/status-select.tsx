"use client";

import { useState, useTransition } from "react";
import { LEAD_STATUSES } from "@/lib/lead-rules";
import { updateLeadStatusAction } from "./actions";

export function LeadStatusSelect({ leadId, status, leadName }: { leadId: string; status: string; leadName: string }) {
  const [value, setValue] = useState(status);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function change(next: string) {
    const previous = value;
    setValue(next);
    setError(undefined);
    setSaved(false);
    startTransition(async () => {
      const result = await updateLeadStatusAction(leadId, next);
      if (result.ok) setSaved(true);
      else {
        setValue(previous); // don't show a status that wasn't saved
        setError(result.error);
      }
    });
  }

  return (
    <div>
      <label className="sr-only" htmlFor={`status-${leadId}`}>
        Status for {leadName}
      </label>
      <select
        id={`status-${leadId}`}
        value={value}
        disabled={pending}
        onChange={(e) => change(e.target.value)}
        className="rounded-lg border border-ink-300 bg-white px-2 py-1.5 text-sm font-medium text-ink-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:opacity-60"
      >
        {LEAD_STATUSES.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <span aria-live="polite" className="ml-2 text-xs">
        {pending ? <span className="text-ink-500">Saving…</span> : null}
        {saved && !pending ? <span className="text-brand-700">Saved</span> : null}
        {error ? <span className="text-red-600">{error}</span> : null}
      </span>
    </div>
  );
}
