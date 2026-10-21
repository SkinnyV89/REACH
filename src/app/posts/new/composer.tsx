"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FormError } from "@/components/auth-form";
import { preparePhoto, sendPhoto } from "@/components/photo-upload";
import { ACCEPT_ATTRIBUTE } from "@/lib/media-rules";
import { MAX_POST_PHOTOS } from "@/lib/post-rules";
import { createDraftAction, publishPostAction, type PostFormState } from "../actions";
import { PostFields, type TaggableProduct } from "../post-fields";

type Picked = { key: string; file: File; preview: string };

// One screen, one "Post" button. Behind it: photos are shrunk in the browser,
// the post is saved as a draft, each photo is uploaded (and cleaned on the
// server), then the post is published. If a photo fails, the seller lands on
// the draft to retry, so nothing is ever half-published.
export function PostComposer({ products }: { products: TaggableProduct[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [state, setState] = useState<PostFormState>({});
  const [note, setNote] = useState<string | null>(null);

  // Free preview memory when photos are removed or the page closes.
  const previews = useRef(new Set<string>());
  useEffect(() => {
    const urls = previews.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  function add(files: File[]) {
    setNote(null);
    const room = MAX_POST_PHOTOS - picked.length;
    const chosen = files.slice(0, Math.max(0, room));
    if (files.length > chosen.length) setNote(`A post can have up to ${MAX_POST_PHOTOS} photos, so the rest weren't added.`);
    const next = chosen.map((file) => {
      const preview = URL.createObjectURL(file);
      previews.current.add(preview);
      return { key: `${file.name}-${file.size}-${Math.random()}`, file, preview };
    });
    setPicked([...picked, ...next]);
    if (inputRef.current) inputRef.current.value = "";
  }

  function remove(key: string) {
    const gone = picked.find((p) => p.key === key);
    if (gone) URL.revokeObjectURL(gone.preview);
    setPicked(picked.filter((p) => p.key !== key));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (picked.length === 0) return setState({ formError: "Add at least one photo." });
    if (!consent) return setState({ formError: "Confirm you have permission from anyone shown in the photos." });
    setBusy(true);
    setState({});
    try {
      // 1. Shrink every photo first, so an unreadable one stops us before
      //    anything is saved.
      setProgress("Preparing photos…");
      const blobs: Blob[] = [];
      for (const p of picked) {
        try {
          blobs.push(await preparePhoto(p.file, "post"));
        } catch (error) {
          setState({ formError: `${p.file.name}: ${error instanceof Error ? error.message : "couldn't be read."}` });
          return;
        }
      }
      // 2. Save the draft (caption and tags are checked on the server).
      setProgress("Saving…");
      const draft = await createDraftAction(form);
      if (!draft.postId) {
        setState(draft);
        return;
      }
      // 3. Upload the photos, one per request.
      let failed = 0;
      for (let i = 0; i < blobs.length; i++) {
        setProgress(`Uploading photo ${i + 1} of ${blobs.length}…`);
        if (await sendPhoto(blobs[i], { target: "post", postId: draft.postId, peopleConsent: true })) failed++;
      }
      // 4. Publish only if every photo made it; otherwise finish on the draft.
      if (failed === 0) {
        setProgress("Posting…");
        const published = await publishPostAction(draft.postId);
        router.push(`/posts/${draft.postId}${published.saved ? "?posted=1" : ""}`);
      } else {
        router.push(`/posts/${draft.postId}?incomplete=${failed}`);
      }
    } catch {
      setState({ formError: "We couldn't post this. Check your connection and try again." });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      <section aria-labelledby="photos-heading" className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 id="photos-heading" className="text-sm font-medium text-ink-900">
            Photos
          </h2>
          <span className="text-xs text-ink-500">
            {picked.length} of {MAX_POST_PHOTOS}
          </span>
        </div>
        {picked.length > 0 && (
          <ul className="grid grid-cols-3 gap-2">
            {picked.map((p, i) => (
              <li key={p.key} className="relative aspect-square overflow-hidden rounded-lg bg-ink-100">
                {/* eslint-disable-next-line @next/next/no-img-element -- local preview of a chosen file */}
                <img src={p.preview} alt={`Chosen photo ${i + 1}`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => remove(p.key)}
                  disabled={busy}
                  aria-label={`Remove photo ${i + 1}`}
                  className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-ink-900/75 text-sm font-bold text-white"
                >
                  ×
                </button>
                {i === 0 && (
                  <span className="absolute bottom-1 left-1 rounded-full bg-ink-900/75 px-2 py-0.5 text-[10px] font-medium text-white">First</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <label className="flex items-start gap-2 text-sm text-ink-900">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
          />
          <span>I have permission from anyone shown in these photos to show them publicly on REACH.</span>
        </label>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          disabled={busy || picked.length >= MAX_POST_PHOTOS}
          onChange={(e) => add(Array.from(e.target.files ?? []))}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy || picked.length >= MAX_POST_PHOTOS}
          className="w-full rounded-lg border border-brand-600 px-4 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-50 disabled:cursor-not-allowed disabled:border-ink-300 disabled:text-ink-500 sm:w-auto"
        >
          {picked.length === 0 ? "Choose photos" : "Add more photos"}
        </button>
        <p className="text-xs text-ink-500">
          Photos from your gallery are labelled &ldquo;From gallery&rdquo; on your post. Location and camera details are removed before
          they&apos;re saved.
        </p>
        {note && <p className="text-sm text-amber-800">{note}</p>}
      </section>

      <PostFields products={products} initial={state.values ?? { caption: "", productIds: [] }} errors={state.errors} key={JSON.stringify(state.values ?? null)} />

      <FormError message={state.formError} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-brand-600 px-6 py-3 font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60 sm:w-auto"
        >
          {busy ? "Posting…" : "Post"}
        </button>
        {progress && (
          <p role="status" className="text-sm text-ink-700">
            {progress}
          </p>
        )}
      </div>
    </form>
  );
}
