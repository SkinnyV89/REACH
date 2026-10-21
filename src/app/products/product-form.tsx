"use client";

import Link from "next/link";
import { useActionState, useState, type FormEvent } from "react";
import { Field, FormError, SubmitButton } from "@/components/auth-form";
import { useFormSubmit } from "@/components/use-form-submit";
import { Select, TextArea } from "@/components/form-controls";
import type { FieldErrors } from "@/lib/auth-rules";
import { PRICE_TYPES, PRODUCT_KINDS } from "@/lib/product-rules";
import type { ProductFormState } from "./actions";

export type ProductFormValues = {
  kind: string;
  name: string;
  categoryId: string;
  description: string;
  priceType: string;
  price: string;
  status: string;
};

type Action = (state: ProductFormState, form: FormData) => Promise<ProductFormState>;

export function ProductForm({
  action: serverAction,
  categories,
  initial,
  submitLabel,
}: {
  action: Action;
  categories: { id: string; name: string }[];
  initial: ProductFormValues;
  submitLabel: string;
}) {
  const [state, action, pending] = useActionState(serverAction, {});
  const onSubmit = useFormSubmit(action);
  const value = (key: keyof ProductFormValues) => {
    const v = state.values?.[key];
    return typeof v === "string" ? v : initial[key];
  };
  const [kind, setKind] = useState(value("kind"));
  const [priceType, setPriceType] = useState(value("priceType"));

  // Errors for a field disappear as soon as that field is edited.
  const [cleared, setCleared] = useState<{ for: ProductFormState; keys: Set<string> }>({
    for: state,
    keys: new Set(),
  });
  const clearedKeys = cleared.for === state ? cleared.keys : new Set<string>();
  const errors: FieldErrors = Object.fromEntries(
    Object.entries(state.errors ?? {}).filter(([k]) => !clearedKeys.has(k)),
  );
  const onChange = (e: FormEvent<HTMLFormElement>) => {
    const name = (e.target as HTMLInputElement).name;
    if (name && errors[name]) setCleared({ for: state, keys: new Set(clearedKeys).add(name) });
  };

  const isService = kind === "SERVICE";

  return (
    <form onSubmit={onSubmit} onChange={onChange} noValidate className="space-y-5">
      <FormError message={state.formError} />

      <fieldset>
        <legend className="block text-sm font-medium text-ink-900">Is this a product or a service?</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {PRODUCT_KINDS.map((k) => (
            <label
              key={k.value}
              className={`cursor-pointer rounded-lg border p-3 transition ${
                kind === k.value ? "border-brand-500 bg-brand-50" : "border-ink-300 bg-white hover:border-brand-200"
              }`}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="kind"
                  value={k.value}
                  checked={kind === k.value}
                  onChange={() => setKind(k.value)}
                  className="h-4 w-4 accent-brand-600"
                />
                <span className="font-medium text-ink-900">{k.label}</span>
              </span>
              <span className="mt-1 block text-sm text-ink-500">{k.hint}</span>
            </label>
          ))}
        </div>
        {errors.kind && <p className="mt-1 text-sm text-red-600">{errors.kind}</p>}
      </fieldset>

      <Field
        id="name"
        label={isService ? "Service name" : "Product name"}
        placeholder={isService ? "e.g. Knotless braids" : "e.g. 22-inch Brazilian body-wave weave"}
        defaultValue={value("name")}
        error={errors.name}
      />

      <Select
        id="categoryId"
        label="Category"
        defaultValue={value("categoryId")}
        error={errors.categoryId}
        hint="Selling something in another category? Add it to your business profile first."
      >
        {categories.length > 1 && <option value="">Choose a category</option>}
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>

      <TextArea
        id="description"
        label="Description"
        optional
        rows={4}
        placeholder={
          isService
            ? "What's included, how long it takes, what customers should bring."
            : "Size, colour, material, what makes it good."
        }
        hint="Stick to facts you can stand behind. Campaigns will use this as the source of truth."
        defaultValue={value("description")}
        error={errors.description}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <Select
          id="priceType"
          label="Pricing"
          value={priceType}
          onChange={(e) => setPriceType(e.target.value)}
          error={errors.priceType}
        >
          {PRICE_TYPES.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
        {priceType !== "ON_REQUEST" ? (
          <Field
            id="price"
            label={priceType === "FROM" ? "Starting price (R)" : "Price (R)"}
            inputMode="decimal"
            placeholder="e.g. 850"
            defaultValue={value("price")}
            error={errors.price}
          />
        ) : (
          <input type="hidden" name="price" value="" />
        )}
      </div>

      <Select
        id="status"
        label="Availability"
        defaultValue={value("status")}
        error={errors.status}
      >
        <option value="AVAILABLE">{isService ? "Taking bookings" : "In stock"}</option>
        <option value="UNAVAILABLE">{isService ? "Not taking bookings right now" : "Out of stock for now"}</option>
      </Select>

      <div className="rounded-lg border border-dashed border-ink-300 bg-ink-100/60 p-3 text-sm text-ink-700">
        <span className="font-medium text-ink-900">Photos</span> can&apos;t be added yet. Image upload will be
        added once secure file storage is set up.
      </div>

      <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/products"
          className="text-center text-sm font-semibold text-ink-700 hover:text-ink-900 hover:underline"
        >
          Cancel
        </Link>
        <div className="sm:w-56">
          <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
        </div>
      </div>
    </form>
  );
}
