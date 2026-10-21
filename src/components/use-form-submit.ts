"use client";

import { startTransition, type FormEvent } from "react";

// Submits a form to a useActionState action without React 19's automatic
// form reset. That reset clears fields after every submit — including failed
// ones — and <select> elements don't recover their value, so a seller would
// lose choices they already made. Sending the FormData ourselves keeps every
// field exactly as the seller left it.
export function useFormSubmit(dispatch: (form: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    startTransition(() => dispatch(form));
  };
}
