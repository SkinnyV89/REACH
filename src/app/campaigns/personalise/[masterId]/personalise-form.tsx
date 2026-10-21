"use client";

import { useActionState } from "react";
import { FormError, SubmitButton } from "@/components/auth-form";
import { Select } from "@/components/form-controls";
import { useFormSubmit } from "@/components/use-form-submit";
import type { PersonaliseState } from "../../actions";

export function PersonaliseForm({
  action: serverAction,
  products,
}: {
  action: (state: PersonaliseState, form: FormData) => Promise<PersonaliseState>;
  products: { id: string; label: string }[];
}) {
  const [state, action, pending] = useActionState(serverAction, {});
  const onSubmit = useFormSubmit(action);
  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <FormError message={state.formError} />
      {products.length > 0 ? (
        <Select
          id="productId"
          label="Feature a product or service (optional)"
          defaultValue=""
          hint="Its name and price come straight from your products list, never from the AI."
        >
          <option value="">No specific product</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      ) : (
        <input type="hidden" name="productId" value="" />
      )}
      <SubmitButton pending={pending}>Create my campaign</SubmitButton>
    </form>
  );
}
