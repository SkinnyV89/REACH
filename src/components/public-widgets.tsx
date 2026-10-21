"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { Field, FormError, SubmitButton } from "@/components/auth-form";
import { TextArea } from "@/components/form-controls";
import { useFormSubmit } from "@/components/use-form-submit";
import type { LeadFormState } from "@/app/c/[link]/actions";

type TrackPayload =
  | { link: string; type: "VIEW" | "WHATSAPP_CLICK"; src: string | null }
  | { storefront: string; item: string | null; post?: string | null; type: "VIEW"; src: string | null; c: string | null };

function send(payload: TrackPayload) {
  const body = JSON.stringify(payload);
  // sendBeacon survives the page navigating away to WhatsApp.
  if (navigator.sendBeacon?.(`/api/track`, new Blob([body], { type: "application/json" }))) return;
  void fetch("/api/track", { method: "POST", body, headers: { "content-type": "application/json" }, keepalive: true });
}

// Records one anonymous view per page load (deduplicated on the server).
export function ViewTracker({ payload }: { payload: TrackPayload }) {
  const key = JSON.stringify(payload);
  useEffect(() => send(JSON.parse(key)), [key]);
  return null;
}

export function WhatsAppButton({
  href,
  link,
  src,
  label,
  trackable,
}: {
  href: string;
  link: string;
  src: string | null;
  label: string;
  trackable: boolean;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackable && send({ link, type: "WHATSAPP_CLICK", src })}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#1fa855] px-4 py-3.5 text-lg font-semibold text-white shadow-sm transition hover:bg-[#178a45] focus:outline-none focus:ring-4 focus:ring-green-200"
    >
      <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6 fill-current">
        <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" />
      </svg>
      {label}
    </a>
  );
}

export function LeadForm({
  action: serverAction,
  businessName,
  disabled,
  disabledText = "Enquiries open once this campaign is published.",
}: {
  action: (state: LeadFormState, form: FormData) => Promise<LeadFormState>;
  businessName: string;
  disabled?: boolean;
  disabledText?: string;
}) {
  const [state, action, pending] = useActionState(serverAction, {});
  const onSubmit = useFormSubmit(action);

  if (state.sent) {
    return (
      <div role="status" className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-6 text-center">
        <p className="text-lg font-semibold text-brand-900">Thanks, your enquiry has been sent.</p>
        <p className="mt-1 text-sm text-brand-900">{businessName} will be in touch.</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <FormError message={state.formError} />
      <Field id="name" label="Your name" autoComplete="name" defaultValue={state.values?.name} error={state.errors?.name} />
      <Field
        id="contact"
        label="Phone number"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="082 123 4567"
        defaultValue={state.values?.contact}
        error={state.errors?.contact}
      />
      <TextArea
        id="message"
        label="Message"
        optional
        placeholder="What would you like to know?"
        defaultValue={state.values?.message}
        error={state.errors?.message}
      />
      {/* Honeypot: hidden from people and assistive tech. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>
      <div>
        <label className="flex items-start gap-3 text-sm text-ink-700">
          <input
            type="checkbox"
            name="consent"
            aria-invalid={state.errors?.consent ? true : undefined}
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-ink-300 accent-brand-600"
          />
          <span>
            I agree that {businessName} may contact me about this enquiry, and that REACH stores these details for that
            purpose. See the{" "}
            <Link href="/privacy" className="font-semibold text-brand-700 underline">
              privacy notice
            </Link>
            .
          </span>
        </label>
        {state.errors?.consent && <p className="mt-1 text-sm text-red-600">{state.errors.consent}</p>}
      </div>
      {disabled ? (
        <p className="rounded-lg bg-ink-100 px-3 py-2 text-center text-sm text-ink-700">
          {disabledText}
        </p>
      ) : (
        <SubmitButton pending={pending}>Send enquiry</SubmitButton>
      )}
    </form>
  );
}
