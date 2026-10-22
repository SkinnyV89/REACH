"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, FormError, SubmitButton } from "@/components/auth-form";
import { authClient } from "@/lib/auth-client";
import {
  PASSWORD_MIN_LENGTH,
  authErrorMessage,
  fieldErrors,
  signUpSchema,
  type FieldErrors,
} from "@/lib/auth-rules";

// After signing up: back to where they came from (e.g. a storefront they
// wanted to follow), into seller setup if they came to sell, else the feed.
export function SignUpForm({ next }: { next: string }) {
  const router = useRouter();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);
    const parsed = signUpSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    const { error } = await authClient.signUp.email(parsed.data);
    if (error) {
      setFormError(authErrorMessage(error));
      setPending(false);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <FormError message={formError} />
      <Field id="name" label="Your name" autoComplete="name" required error={errors.name} />
      <Field
        id="email"
        label="Email address"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        error={errors.email}
      />
      <Field
        id="password"
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        error={errors.password}
      />
      <SubmitButton pending={pending}>Create my account</SubmitButton>
    </form>
  );
}
