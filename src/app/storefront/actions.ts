"use server";

import { revalidatePath } from "next/cache";
import { fieldErrors, type FieldErrors } from "@/lib/auth-rules";
import { requireSeller } from "@/lib/session";
import { formDataToObject } from "@/lib/seller-profile";
import { StorefrontError, saveStorefront, setStorefrontPublished } from "@/lib/storefronts";
import { storefrontSchema } from "@/lib/storefront-rules";

export type StorefrontFormState = {
  saved?: boolean;
  errors?: FieldErrors;
  formError?: string;
  values?: Record<string, unknown>;
};

function fail(error: unknown, values?: Record<string, unknown>): StorefrontFormState {
  if (error instanceof StorefrontError) return { formError: error.message, values };
  console.error("[storefront] save failed:", error instanceof Error ? error.name : typeof error);
  return { formError: "We couldn't save your storefront. Please try again.", values };
}

export async function saveStorefrontAction(_prev: StorefrontFormState, form: FormData): Promise<StorefrontFormState> {
  const { session, seller } = await requireSeller();
  const values = formDataToObject(form);
  const parsed = storefrontSchema.safeParse({ serviceRadiusKm: "", ...values });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  try {
    await saveStorefront(session.user.id, seller.id, parsed.data);
  } catch (error) {
    return fail(error, values);
  }
  revalidatePath("/storefront");
  revalidatePath(`/s/${seller.slug}`);
  return { saved: true };
}

export async function setPublishedAction(published: boolean): Promise<StorefrontFormState> {
  const { session, seller } = await requireSeller();
  try {
    await setStorefrontPublished(session.user.id, seller.id, published);
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/storefront");
  revalidatePath(`/s/${seller.slug}`);
  return {};
}
