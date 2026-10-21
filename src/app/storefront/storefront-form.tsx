"use client";

import { useActionState, useState, type FormEvent } from "react";
import { Field, FormError, SubmitButton } from "@/components/auth-form";
import { Select, TextArea } from "@/components/form-controls";
import { useFormSubmit } from "@/components/use-form-submit";
import type { FieldErrors } from "@/lib/auth-rules";
import { LAYOUTS, provinceName } from "@/lib/storefront-rules";
import type { StorefrontFormState } from "./actions";

export type StorefrontFormValues = {
  tagline: string;
  description: string;
  placeId: string;
  areaDetail: string;
  serviceRadiusKm: string;
  layout: string;
};

export function StorefrontForm({
  action: serverAction,
  initial,
  places,
  delivers,
}: {
  action: (state: StorefrontFormState, form: FormData) => Promise<StorefrontFormState>;
  initial: StorefrontFormValues;
  places: { id: string; name: string; province: string }[];
  delivers: boolean;
}) {
  const [state, action, pending] = useActionState(serverAction, {});
  const onSubmit = useFormSubmit(action);
  const value = (k: keyof StorefrontFormValues) => {
    const v = state.values?.[k];
    return typeof v === "string" ? v : initial[k];
  };
  const [layout, setLayout] = useState(value("layout"));

  // Field errors clear as the seller edits that field.
  const [cleared, setCleared] = useState<{ for: StorefrontFormState; keys: Set<string> }>({ for: state, keys: new Set() });
  const keys = cleared.for === state ? cleared.keys : new Set<string>();
  const errors: FieldErrors = Object.fromEntries(Object.entries(state.errors ?? {}).filter(([k]) => !keys.has(k)));
  const onChange = (e: FormEvent<HTMLFormElement>) => {
    const name = (e.target as HTMLInputElement).name;
    if (name && errors[name]) setCleared({ for: state, keys: new Set(keys).add(name) });
  };

  const byProvince = new Map<string, typeof places>();
  for (const p of places) byProvince.set(p.province, [...(byProvince.get(p.province) ?? []), p]);

  return (
    <form onSubmit={onSubmit} onChange={onChange} noValidate className="space-y-5">
      <FormError message={state.formError} />
      {state.saved && (
        <p role="status" className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm text-brand-900">
          Storefront saved.
        </p>
      )}

      <Field
        id="tagline"
        label="Tagline"
        optional
        placeholder="e.g. Neat knotless braids that last"
        hint="One line under your name. Say what you're known for."
        defaultValue={value("tagline")}
        error={errors.tagline}
      />
      <TextArea
        id="description"
        label="About your business"
        optional
        rows={4}
        placeholder="How long you've been doing this, what you specialise in, how to book."
        defaultValue={value("description")}
        error={errors.description}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <Select id="placeId" label="Town or city" defaultValue={value("placeId")} error={errors.placeId}>
          <option value="">Choose your town or city</option>
          {[...byProvince.entries()].map(([province, list]) => (
            <optgroup key={province} label={provinceName(province)}>
              {list.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
        <Field
          id="areaDetail"
          label="Neighbourhood"
          optional
          placeholder="e.g. Pimville"
          hint="Shown with your town. Never your street address."
          defaultValue={value("areaDetail")}
          error={errors.areaDetail}
        />
      </div>

      {delivers && (
        <Field
          id="serviceRadiusKm"
          label="How far do you deliver or travel? (km)"
          optional
          inputMode="numeric"
          placeholder="e.g. 10"
          defaultValue={value("serviceRadiusKm")}
          error={errors.serviceRadiusKm}
        />
      )}

      <fieldset>
        <legend className="block text-sm font-medium text-ink-900">Layout</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {LAYOUTS.map((l) => (
            <label
              key={l.value}
              className={`cursor-pointer rounded-lg border p-3 transition ${
                layout === l.value ? "border-brand-500 bg-brand-50" : "border-ink-300 bg-white hover:border-brand-200"
              }`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="layout"
                  value={l.value}
                  checked={layout === l.value}
                  onChange={() => setLayout(l.value)}
                  className="h-4 w-4 accent-brand-600"
                />
                <span className="font-medium text-ink-900">{l.label}</span>
              </span>
              <span className="mt-1 block text-sm text-ink-500">{l.hint}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="sm:w-56">
        <SubmitButton pending={pending}>Save storefront</SubmitButton>
      </div>
    </form>
  );
}
