import { CAPTURE_EXPLAINER, captureLabel, type CaptureSourceValue } from "@/lib/post-rules";

// How a photo reached REACH. Set by the server, never by the browser: every
// upload today is "From gallery"; "Photo taken in REACH" appears only once
// REACH's own camera exists and records it.
export function CaptureLabel({ source, capturedAt, className = "" }: { source: CaptureSourceValue; capturedAt: Date | null; className?: string }) {
  const inApp = source === "IN_APP_CAMERA";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
        inApp ? "bg-brand-600 text-white" : "bg-ink-900/75 text-white"
      } ${className}`}
    >
      <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-none stroke-current" strokeWidth={2}>
        {inApp ? (
          <>
            <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
            <circle cx="12" cy="13" r="3.5" />
          </>
        ) : (
          <>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="m21 16-5-5-8 8" />
          </>
        )}
      </svg>
      {captureLabel(source, capturedAt)}
    </span>
  );
}

// Plain-language note on what the labels mean, shown with the photos.
export function CaptureExplainer({ sources }: { sources: CaptureSourceValue[] }) {
  const present = (["IN_APP_CAMERA", "GALLERY"] as const).filter((s) => sources.includes(s));
  return (
    <div className="text-xs text-ink-500">
      {present.map((s) => (
        <p key={s}>{CAPTURE_EXPLAINER[s]}</p>
      ))}
    </div>
  );
}
