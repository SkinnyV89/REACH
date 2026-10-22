"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Field, FormError, SubmitButton } from "@/components/auth-form";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage, fieldErrors, signInSchema, type FieldErrors } from "@/lib/auth-rules";

export function SignInForm({ next }: { next: string }) {
  const router = useRouter();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(undefined);
    const parsed = signInSchema.safeParse(Object.fromEntries(new FormData(event.currentTarget)));
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    const { error } = await authClient.signIn.email(parsed.data);
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
        autoComplete="current-password"
        required
        error={errors.password}
      />
      <SubmitButton pending={pending}>Sign in</SubmitButton>
    </form>
  );
}
