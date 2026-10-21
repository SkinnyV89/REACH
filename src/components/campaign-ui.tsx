import type { ReactNode } from "react";

// Always shown next to campaign copy, so sellers know where it came from.
export function SourceBadge({ source }: { source: "AI" | "TEMPLATE" }) {
  return source === "AI" ? (
    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">AI-written</span>
  ) : (
    <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-700">
      Template, not AI-written
    </span>
  );
}

// A phone-post style preview of an advert. Purely visual: the call to action
// is not a working button until the public campaign page exists.
export function AdPreview({
  businessName,
  location,
  headline,
  body,
  callToAction,
  footer,
}: {
  businessName: string;
  location?: string | null;
  headline: string;
  body: string;
  callToAction: string;
  footer?: ReactNode;
}) {
  return (
    <figure className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-ink-300/60 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-ink-100 px-4 py-3">
        <span
          aria-hidden
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 font-bold text-white"
        >
          {businessName.trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-900">{businessName}</p>
          {location && <p className="truncate text-xs text-ink-500">{location}</p>}
        </div>
      </div>
      <div className="bg-gradient-to-br from-brand-50 to-white px-5 py-6">
        <p className="text-xl font-bold leading-snug text-ink-900">{headline}</p>
        <p className="mt-3 whitespace-pre-line text-ink-700">{body}</p>
      </div>
      <div className="px-4 pb-4">
        <span className="block w-full rounded-lg bg-brand-600 px-4 py-2.5 text-center font-semibold text-white">
          {callToAction}
        </span>
        {footer}
      </div>
    </figure>
  );
}
