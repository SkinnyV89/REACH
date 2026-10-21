"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ACCEPT_ATTRIBUTE,
  CLIENT_MAX_DIMENSION,
  LOGO_CLIENT_MAX_DIMENSION,
  MAX_UPLOAD_BYTES,
  fitWithin,
  needsPeopleConsent,
  uploadErrorMessage,
  type UploadTarget,
} from "@/lib/media-rules";

// Picks photos, shrinks them in the browser so each upload fits Vercel's
// 4.5 MB request limit, and sends them one at a time to /api/uploads. The
// server checks and re-encodes everything again; this step is about speed
// and data costs on mobile, not security.

type Status = { name: string; state: "working" | "done" | "error"; message?: string };

const UNREADABLE =
  "This browser can't open that photo. Try a JPEG or PNG. On an iPhone, sharing the photo or taking a screenshot of it gives a JPEG.";
const SERVER_READABLE = new Set(["image/jpeg", "image/png", "image/webp"]);

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

// Re-draws the photo at most `max` pixels on its longest side. Canvas output
// carries no EXIF, and createImageBitmap applies the camera's orientation.
export async function preparePhoto(file: File, target: UploadTarget): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // The browser can't decode it (e.g. HEIC in Chrome). If the server can,
    // and it fits, send it as it is; otherwise explain.
    if (SERVER_READABLE.has(file.type) && file.size <= MAX_UPLOAD_BYTES) return file;
    throw new Error(UNREADABLE);
  }
  try {
    // Logos keep transparency (PNG); photos become JPEG.
    const type = target === "logo" ? "image/png" : "image/jpeg";
    let max = target === "logo" ? LOGO_CLIENT_MAX_DIMENSION : CLIENT_MAX_DIMENSION;
    let quality = 0.85;
    for (let attempt = 0; attempt < 5; attempt++) {
      const size = fitWithin(bitmap.width, bitmap.height, max);
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error(UNREADABLE);
      ctx.drawImage(bitmap, 0, 0, size.width, size.height);
      const blob = await canvasBlob(canvas, type, type === "image/jpeg" ? quality : undefined);
      if (blob && blob.size <= MAX_UPLOAD_BYTES) return blob;
      // Still too big (very detailed photo, or a large PNG): go smaller.
      max = Math.round(max * 0.75);
      quality = Math.max(0.6, quality - 0.1);
    }
    throw new Error(uploadErrorMessage("too_large"));
  } finally {
    bitmap.close();
  }
}

// Sends one prepared photo to /api/uploads. Returns an error message, or null.
export async function sendPhoto(
  blob: Blob,
  opts: { target: UploadTarget; productId?: string | null; postId?: string | null; peopleConsent: boolean },
): Promise<string | null> {
  const form = new FormData();
  // The server ignores file names; don't send the original one.
  form.set("file", blob, blob.type === "image/png" ? "photo.png" : "photo.jpg");
  form.set("target", opts.target);
  if (opts.productId) form.set("productId", opts.productId);
  if (opts.postId) form.set("postId", opts.postId);
  if (opts.peopleConsent) form.set("peopleConsent", "on");
  try {
    const res = await fetch("/api/uploads", { method: "POST", body: form });
    const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (res.ok && body?.ok) return null;
    return uploadErrorMessage(body?.error ?? (res.status === 413 ? "too_large" : "failed"));
  } catch {
    return uploadErrorMessage("failed");
  }
}

export function PhotoUpload({
  target,
  productId = null,
  postId = null,
  remaining = 1,
  label,
  disabledText,
}: {
  target: UploadTarget;
  productId?: string | null;
  postId?: string | null;
  remaining?: number; // how many more photos may be added
  label: string;
  disabledText?: string; // shown instead of the picker when uploads are off
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const askConsent = needsPeopleConsent(target);
  const multiple = target === "product" || target === "post";

  async function upload(files: File[]) {
    setNote(null);
    const chosen = files.slice(0, Math.max(0, remaining));
    if (files.length > chosen.length) {
      setNote(`Only ${chosen.length} more ${chosen.length === 1 ? "photo fits" : "photos fit"}, so the rest weren't added.`);
    }
    if (chosen.length === 0) return;
    setBusy(true);
    const list: Status[] = chosen.map((f) => ({ name: f.name, state: "working" }));
    setStatuses([...list]);
    const update = (i: number, s: Partial<Status>) => {
      list[i] = { ...list[i], ...s };
      setStatuses([...list]);
    };

    for (let i = 0; i < chosen.length; i++) {
      try {
        const blob = await preparePhoto(chosen[i], target);
        const error = await sendPhoto(blob, { target, productId, postId, peopleConsent: askConsent && consent });
        if (error) {
          update(i, { state: "error", message: error });
          continue;
        }
        update(i, { state: "done" });
        router.refresh();
      } catch (error) {
        update(i, { state: "error", message: error instanceof Error ? error.message : uploadErrorMessage("failed") });
      }
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  if (disabledText) return <p className="rounded-lg bg-ink-100 px-3 py-2 text-sm text-ink-700">{disabledText}</p>;

  const blocked = busy || remaining <= 0 || (askConsent && !consent);
  return (
    <div className="space-y-3">
      {askConsent && (
        <label className="flex items-start gap-2 text-sm text-ink-900">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
          />
          <span>
            I have permission from anyone shown in {multiple ? "these photos" : "this photo"} to show it publicly on REACH.
          </span>
        </label>
      )}
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        multiple={multiple}
        disabled={blocked}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => upload(Array.from(e.target.files ?? []))}
      />
      <button
        type="button"
        disabled={blocked}
        onClick={() => inputRef.current?.click()}
        className="w-full rounded-lg border border-brand-600 px-4 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:border-ink-300 disabled:text-ink-500 sm:w-auto"
      >
        {busy ? "Uploading…" : label}
      </button>
      {askConsent && !consent && remaining > 0 && (
        <p className="text-xs text-ink-500">Tick the box above to choose {multiple ? "photos" : "a photo"}.</p>
      )}
      {note && <p className="text-sm text-amber-800">{note}</p>}
      {statuses.length > 0 && (
        <ul aria-live="polite" className="space-y-1 text-sm">
          {statuses.map((s, i) => (
            <li key={i} className={s.state === "error" ? "text-red-600" : s.state === "done" ? "text-brand-700" : "text-ink-700"}>
              <span className="font-medium">{s.name}</span>:{" "}
              {s.state === "working" ? "uploading…" : s.state === "done" ? "added" : s.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
