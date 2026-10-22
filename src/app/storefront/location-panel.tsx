"use client";

import { useActionState, useState, useTransition } from "react";
import { FormError } from "@/components/auth-form";
import { useFormSubmit } from "@/components/use-form-submit";
import { ADDRESS_MAX, checkPinUrl } from "@/lib/location-rules";
import type { StorefrontFormState } from "./actions";

type Pin = { latitude: number; longitude: number } | null;

// The shop pin is set from the seller's phone while they're at the shop:
// precise (GPS), checkable on Google Maps, and the base for directions.
export function PinSetter({
  pin: initial,
  townName,
  setPin,
  clearPin,
}: {
  pin: Pin;
  townName: string | null;
  setPin: (latitude: number, longitude: number) => Promise<{ error?: string; pin?: { latitude: number; longitude: number } }>;
  clearPin: () => Promise<StorefrontFormState>;
}) {
  const [pin, setLocal] = useState<Pin>(initial);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function locate() {
    setMessage(null);
    if (!("geolocation" in navigator)) return setMessage("This browser can't share its location. Try on your phone.");
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        start(async () => {
          const r = await setPin(pos.coords.latitude, pos.coords.longitude);
          if (r.pin) {
            setLocal(r.pin);
            setMessage(
              pos.coords.accuracy > 100
                ? `Saved, but your phone said it was only accurate to about ${Math.round(pos.coords.accuracy)} m. Check it on Google Maps; try again outside for a better fix.`
                : "Location saved. Check it on Google Maps.",
            );
          } else setMessage(r.error ?? "We couldn't save your location.");
        }),
      () => setMessage("Location wasn't shared. Allow location for REACH in your browser settings and try again."),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20_000 },
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-ink-700">
        Stand at your shop, stall or kitchen and tap the button. REACH saves that exact spot{townName ? ` (it must be near ${townName})` : ""}.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={locate}
          disabled={pending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : pin ? "Update to where I am now" : "Use my location here"}
        </button>
        {pin && (
          <>
            <a href={checkPinUrl(pin)} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-brand-700 hover:underline">
              Check on Google Maps ↗
            </a>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await clearPin();
                  setLocal(null);
                  setMessage("Location removed. Collection is turned off until you set it again.");
                })
              }
              className="text-sm font-medium text-red-700 hover:underline"
            >
              Remove location
            </button>
          </>
        )}
      </div>
      <p className="text-xs text-ink-500">
        {pin ? `Saved: ${pin.latitude.toFixed(5)}, ${pin.longitude.toFixed(5)}` : "No shop location set. Distances use your town's centre."}
      </p>
      {message && (
        <p role="status" className="text-sm text-ink-900">
          {message}
        </p>
      )}
    </div>
  );
}

export function CollectionForm({
  action,
  initial,
  hasPin,
}: {
  action: (prev: StorefrontFormState, form: FormData) => Promise<StorefrontFormState>;
  initial: { offersCollection: boolean; collectionAddress: string; callNumber: string };
  hasPin: boolean;
}) {
  const [state, dispatch, pending] = useActionState(action, {});
  const onSubmit = useFormSubmit(dispatch);
  const values = { ...initial, ...(state.values as typeof initial | undefined) };
  const [collect, setCollect] = useState(Boolean(values.offersCollection));

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <label className="flex items-start gap-2 text-sm text-ink-900">
        <input
          type="checkbox"
          name="offersCollection"
          checked={collect}
          onChange={(e) => setCollect(e.target.checked)}
          disabled={!hasPin && !collect}
          className="mt-0.5 h-5 w-5 rounded border-ink-300 text-brand-600"
        />
        <span>
          <span className="font-medium">Customers collect from me</span>
          <span className="block text-ink-500">
            {hasPin
              ? "Shows your address and a Get directions button to signed-in buyers."
              : "Set your shop location above first, so buyers can get directions."}
          </span>
        </span>
      </label>
      <div>
        <label htmlFor="collectionAddress" className="block text-sm font-medium text-ink-900">
          Collection address {!collect && <span className="font-normal text-ink-500">(optional)</span>}
        </label>
        <textarea
          id="collectionAddress"
          name="collectionAddress"
          rows={2}
          maxLength={ADDRESS_MAX}
          defaultValue={values.collectionAddress}
          placeholder="e.g. 2192 NU 11A, Mdantsane"
          aria-describedby="collectionAddress-hint"
          className="mt-1 block w-full rounded-lg border border-ink-300 px-3 py-2 text-base"
        />
        {state.errors?.collectionAddress ? (
          <p className="mt-1 text-sm text-red-600">{state.errors.collectionAddress}</p>
        ) : (
          <p id="collectionAddress-hint" className="mt-1 text-xs text-ink-500">
            Shown only when collection is on, and only to buyers who are signed in.
          </p>
        )}
      </div>
      <div>
        <label htmlFor="callNumber" className="block text-sm font-medium text-ink-900">
          Number for calls <span className="font-normal text-ink-500">(optional)</span>
        </label>
        <input
          id="callNumber"
          name="callNumber"
          type="tel"
          inputMode="tel"
          defaultValue={values.callNumber}
          placeholder="073 102 1410"
          className="mt-1 block w-full rounded-lg border border-ink-300 px-3 py-2 text-base"
        />
        {state.errors?.callNumber ? (
          <p className="mt-1 text-sm text-red-600">{state.errors.callNumber}</p>
        ) : (
          <p className="mt-1 text-xs text-ink-500">If it&apos;s different from your WhatsApp number. Buyers get a Call button; the number isn&apos;t written on your page.</p>
        )}
      </div>
      <FormError message={state.formError} />
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-lg bg-brand-600 px-5 py-2.5 font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
          {pending ? "Saving…" : "Save"}
        </button>
        {state.saved && !pending && (
          <p role="status" className="text-sm text-brand-700">
            Saved.
          </p>
        )}
      </div>
    </form>
  );
}
