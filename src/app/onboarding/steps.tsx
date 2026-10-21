"use client";

import Link from "next/link";
import { useActionState, useState, type FormEvent } from "react";
import type { FieldErrors } from "@/lib/auth-rules";
import { Field, FormError, SubmitButton } from "@/components/auth-form";
import { useFormSubmit } from "@/components/use-form-submit";
import { CheckboxCards, Select, TextArea } from "@/components/form-controls";
import { FULFILMENT_OPTIONS, MAX_CATEGORIES, PROVINCES } from "@/lib/seller-profile";
import {
  completeOnboardingAction,
  saveBusinessAction,
  saveCategoriesAction,
  type StepState,
} from "./actions";

// Submitted values win over saved ones, so input survives a failed save.
function pick(state: StepState, key: string, saved: string | null | undefined): string {
  const v = state.values?.[key];
  return typeof v === "string" ? v : (saved ?? "");
}

function pickList(state: StepState, key: string, saved: string[]): string[] {
  const v = state.values?.[key];
  return Array.isArray(v) ? v.map(String) : saved;
}

// Server errors for a field disappear as soon as the user edits that field,
// so corrected fields don't keep showing a stale message until resubmit.
function useLiveErrors(state: StepState) {
  const [cleared, setCleared] = useState<{ for: StepState; keys: Set<string> }>({ for: state, keys: new Set() });
  const keys = cleared.for === state ? cleared.keys : new Set<string>();
  const errors: FieldErrors = Object.fromEntries(
    Object.entries(state.errors ?? {}).filter(([k]) => !keys.has(k)),
  );
  const onChange = (e: FormEvent<HTMLFormElement>) => {
    const name = (e.target as HTMLInputElement).name;
    if (name && errors[name]) setCleared({ for: state, keys: new Set(keys).add(name) });
  };
  return { errors, onChange };
}

function StepActions({ pending, backStep, label }: { pending: boolean; backStep?: number; label: string }) {
  return (
    <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
      {backStep ? (
        <Link
          href={`/onboarding?step=${backStep}`}
          className="text-center text-sm font-semibold text-ink-700 hover:text-ink-900 hover:underline"
        >
          ← Back
        </Link>
      ) : (
        <span />
      )}
      <div className="sm:w-56">
        <SubmitButton pending={pending}>{label}</SubmitButton>
      </div>
    </div>
  );
}

export function BusinessStep({
  saved,
}: {
  saved: { businessName: string; whatsappNumber: string | null; description: string | null } | null;
}) {
  const [state, action, pending] = useActionState(saveBusinessAction, {});
  const onSubmit = useFormSubmit(action);
  const { errors, onChange } = useLiveErrors(state);
  return (
    <form onSubmit={onSubmit} onChange={onChange} noValidate className="space-y-5">
      <FormError message={state.formError} />
      <Field
        id="businessName"
        label="Business or trading name"
        autoComplete="organization"
        placeholder="e.g. Thandi's Hair Boutique"
        required
        defaultValue={pick(state, "businessName", saved?.businessName)}
        error={errors.businessName}
      />
      <Field
        id="whatsappNumber"
        label="WhatsApp number"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="082 123 4567"
        required
        hint="Customers will use this to message you about your products."
        defaultValue={pick(state, "whatsappNumber", saved?.whatsappNumber)}
        error={errors.whatsappNumber}
      />
      <TextArea
        id="description"
        label="Describe your business in a sentence or two"
        optional
        placeholder="e.g. Quality human-hair weaves and wigs, delivered across Soweto."
        defaultValue={pick(state, "description", saved?.description)}
        error={errors.description}
      />
      <StepActions pending={pending} label="Save and continue" />
    </form>
  );
}

export function CategoriesStep({
  categories,
  saved,
}: {
  categories: { id: string; name: string; description: string | null }[];
  saved: {
    categoryIds: string[];
    province: string | null;
    location: string | null;
    fulfilment: string[];
    serviceArea: string | null;
  };
}) {
  const [state, action, pending] = useActionState(saveCategoriesAction, {});
  const onSubmit = useFormSubmit(action);
  const { errors, onChange } = useLiveErrors(state);
  const [chosen, setChosen] = useState<string[]>(() => pickList(state, "categoryIds", saved.categoryIds));
  const [fulfilment, setFulfilment] = useState<string[]>(() => pickList(state, "fulfilment", saved.fulfilment));
  const atLimit = chosen.length >= MAX_CATEGORIES;

  return (
    <form onSubmit={onSubmit} onChange={onChange} noValidate className="space-y-6">
      <FormError message={state.formError} />
      <CheckboxCards
        name="categoryIds"
        legend="What do you sell?"
        hint={`Choose up to ${MAX_CATEGORIES}. We use this to show you campaigns made for your kind of business.`}
        error={errors.categoryIds}
        options={categories.map((c) => ({ value: c.id, label: c.name, description: c.description }))}
        checked={chosen}
        disabledValues={atLimit ? categories.map((c) => c.id) : []}
        onToggle={(value, next) =>
          setChosen((prev) => (next ? [...prev, value] : prev.filter((v) => v !== value)))
        }
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <Select
          id="province"
          label="Province"
          defaultValue={pick(state, "province", saved.province)}
          error={errors.province}
        >
          <option value="">Choose a province</option>
          {PROVINCES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
        <Field
          id="location"
          label="Town, suburb or area"
          autoComplete="address-level2"
          placeholder="e.g. Soweto"
          defaultValue={pick(state, "location", saved.location)}
          error={errors.location}
        />
      </div>

      <CheckboxCards
        name="fulfilment"
        legend="How do customers get your products or services?"
        hint="Choose all that apply."
        error={errors.fulfilment}
        options={FULFILMENT_OPTIONS.map((f) => ({ value: f.value, label: f.label }))}
        checked={fulfilment}
        onToggle={(value, next) =>
          setFulfilment((prev) => (next ? [...prev, value] : prev.filter((v) => v !== value)))
        }
      />

      <Field
        id="serviceArea"
        label="Where do you deliver or work?"
        optional
        placeholder="e.g. Soweto and Johannesburg South"
        defaultValue={pick(state, "serviceArea", saved.serviceArea)}
        error={errors.serviceArea}
      />

      <StepActions pending={pending} backStep={1} label="Save and continue" />
    </form>
  );
}

export function ExtrasStep({
  saved,
  isActive,
}: {
  saved: {
    instagramUrl: string | null;
    facebookUrl: string | null;
    tiktokUrl: string | null;
    websiteUrl: string | null;
  };
  isActive: boolean;
}) {
  const [state, action, pending] = useActionState(completeOnboardingAction, {});
  const onSubmit = useFormSubmit(action);
  const { errors, onChange } = useLiveErrors(state);
  return (
    <form onSubmit={onSubmit} onChange={onChange} noValidate className="space-y-5">
      <FormError message={state.formError} />
      <p className="text-sm text-ink-700">
        All optional. Links help customers trust you and see more of your work. You can add them later.
      </p>
      <Field
        id="instagramUrl"
        label="Instagram"
        optional
        placeholder="@yourbusiness or profile link"
        defaultValue={pick(state, "instagramUrl", saved.instagramUrl)}
        error={errors.instagramUrl}
      />
      <Field
        id="facebookUrl"
        label="Facebook page"
        optional
        placeholder="facebook.com/yourbusiness"
        defaultValue={pick(state, "facebookUrl", saved.facebookUrl)}
        error={errors.facebookUrl}
      />
      <Field
        id="tiktokUrl"
        label="TikTok"
        optional
        placeholder="@yourbusiness or profile link"
        defaultValue={pick(state, "tiktokUrl", saved.tiktokUrl)}
        error={errors.tiktokUrl}
      />
      <Field
        id="websiteUrl"
        label="Website"
        optional
        type="url"
        inputMode="url"
        placeholder="yourbusiness.co.za"
        defaultValue={pick(state, "websiteUrl", saved.websiteUrl)}
        error={errors.websiteUrl}
      />
      <div className="rounded-lg border border-dashed border-ink-300 bg-ink-100/60 p-3 text-sm text-ink-700">
        <span className="font-medium text-ink-900">Logo and cover photo:</span> add them on your Shop
        (storefront) page once setup is finished.
      </div>
      <StepActions pending={pending} backStep={2} label={isActive ? "Save changes" : "Finish setup"} />
    </form>
  );
}
