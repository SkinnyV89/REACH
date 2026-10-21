"use client";

import { useActionState, useState } from "react";
import { FormError } from "@/components/auth-form";
import type { StatusState } from "../actions";

export function PublishButton({
  action: serverAction,
  published,
}: {
  action: () => Promise<StatusState>;
  published: boolean;
}) {
  const [state, action, pending] = useActionState(serverAction, {});
  return (
    <form action={action} className="space-y-2">
      <FormError message={state.formError} />
      <button
        type="submit"
        disabled={pending}
        className={`w-full rounded-lg px-4 py-2.5 font-semibold transition disabled:opacity-60 ${
          published
            ? "border border-ink-300 text-ink-700 hover:bg-ink-100"
            : "bg-brand-600 text-white hover:bg-brand-700"
        }`}
      >
        {pending ? "Please wait…" : published ? "Pause campaign" : "Publish campaign"}
      </button>
    </form>
  );
}

export function CopyLink({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be blocked; the link stays visible to copy by hand.
    }
  }
  return (
    <li className="flex items-center gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink-900">{label}</p>
        <p className="truncate font-mono text-xs text-ink-500">{url}</p>
      </div>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 rounded-lg border border-ink-300 px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-100"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </li>
  );
}
