"use server";

import { redirect } from "next/navigation";
import { fieldErrors, type FieldErrors } from "@/lib/auth-rules";
import { requireSession } from "@/lib/session";
import {
  OnboardingError,
  completeOnboarding,
  saveBusinessStep,
  saveCategoriesStep,
} from "@/lib/onboarding";
import {
  businessStepSchema,
  categoriesStepSchema,
  extrasStepSchema,
  formDataToObject,
} from "@/lib/seller-profile";

export type StepState = {
  errors?: FieldErrors;
  formError?: string;
  // What the user typed, so the form keeps it when validation fails.
  values?: Record<string, unknown>;
};

const GENERIC_ERROR = "We couldn't save your details. Please try again.";

function failure(error: unknown, values: Record<string, unknown>): StepState {
  if (error instanceof OnboardingError) return { formError: error.message, values };
  // Log the failure type only; form values may contain personal data.
  console.error("[onboarding] save failed:", error instanceof Error ? error.name : typeof error);
  return { formError: GENERIC_ERROR, values };
}

export async function saveBusinessAction(_prev: StepState, form: FormData): Promise<StepState> {
  const session = await requireSession();
  const values = formDataToObject(form);
  const parsed = businessStepSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  try {
    await saveBusinessStep(session.user.id, parsed.data);
  } catch (error) {
    return failure(error, values);
  }
  redirect("/onboarding?step=2");
}

export async function saveCategoriesAction(_prev: StepState, form: FormData): Promise<StepState> {
  const session = await requireSession();
  const values = formDataToObject(form, ["categoryIds", "fulfilment"]);
  const parsed = categoriesStepSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  try {
    await saveCategoriesStep(session.user.id, parsed.data);
  } catch (error) {
    return failure(error, values);
  }
  redirect("/onboarding?step=3");
}

export async function completeOnboardingAction(_prev: StepState, form: FormData): Promise<StepState> {
  const session = await requireSession();
  const values = formDataToObject(form);
  const parsed = extrasStepSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  try {
    await completeOnboarding(session.user.id, parsed.data);
  } catch (error) {
    return failure(error, values);
  }
  redirect("/dashboard?welcome=1");
}
