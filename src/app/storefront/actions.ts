"use server";

import { revalidatePath } from "next/cache";
import { fieldErrors, type FieldErrors } from "@/lib/auth-rules";
import { MediaError, removeSellerImage } from "@/lib/media";
import { uploadErrorMessage } from "@/lib/media-rules";
import { requireSeller } from "@/lib/session";
import { formDataToObject } from "@/lib/seller-profile";
import { hoursInputSchema } from "@/lib/hours-rules";
import { collectionSchema } from "@/lib/location-rules";
import {
  StorefrontError,
  clearPin,
  saveCollection,
  saveHours,
  saveStorefront,
  setClosedToday,
  setPin,
  setStorefrontPublished,
} from "@/lib/storefronts";
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

// Removes the logo or cover photo (and its stored files).
export async function removeSellerImageAction(target: "logo" | "cover"): Promise<StorefrontFormState> {
  const { session, seller } = await requireSeller();
  // Bound arguments still come from the browser.
  if (target !== "logo" && target !== "cover") return { formError: "Something went wrong. Please try again." };
  try {
    await removeSellerImage(session.user.id, seller.id, target);
  } catch (error) {
    if (error instanceof MediaError) return { formError: uploadErrorMessage(error.code) };
    return fail(error);
  }
  revalidatePath("/storefront");
  revalidatePath(`/s/${seller.slug}`, "layout");
  return {};
}

// ---------------------------------------------------------------------------
// Hours, closed today, shop pin, collection and call number
// ---------------------------------------------------------------------------

export async function saveHoursAction(_prev: StorefrontFormState, form: FormData): Promise<StorefrontFormState> {
  const { session, seller } = await requireSeller();
  let slots: unknown;
  try {
    slots = JSON.parse(String(form.get("slots") ?? "[]"));
  } catch {
    return { formError: "Something went wrong. Please try again." };
  }
  const parsed = hoursInputSchema.safeParse({ slots, note: String(form.get("note") ?? "") });
  if (!parsed.success) return { formError: parsed.error.issues[0].message };
  try {
    await saveHours(session.user.id, seller.id, parsed.data);
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/storefront");
  revalidatePath(`/s/${seller.slug}`, "layout");
  return { saved: true };
}

export async function setClosedTodayAction(closed: boolean): Promise<StorefrontFormState> {
  const { session, seller } = await requireSeller();
  if (typeof closed !== "boolean") return { formError: "Something went wrong. Please try again." };
  try {
    await setClosedToday(session.user.id, seller.id, closed);
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/storefront");
  revalidatePath(`/s/${seller.slug}`, "layout");
  return {};
}

export async function setPinAction(latitude: number, longitude: number): Promise<{ error?: string; pin?: { latitude: number; longitude: number } }> {
  const { session, seller } = await requireSeller();
  if (typeof latitude !== "number" || typeof longitude !== "number") return { error: "We couldn't read your location." };
  try {
    const pin = await setPin(session.user.id, seller.id, latitude, longitude);
    revalidatePath("/storefront");
    revalidatePath(`/s/${seller.slug}`, "layout");
    return { pin };
  } catch (error) {
    if (error instanceof StorefrontError) return { error: error.message };
    console.error("[storefront] pin failed:", error instanceof Error ? error.name : typeof error);
    return { error: "We couldn't save your location. Please try again." };
  }
}

export async function clearPinAction(): Promise<StorefrontFormState> {
  const { session, seller } = await requireSeller();
  try {
    await clearPin(session.user.id, seller.id);
  } catch (error) {
    return fail(error);
  }
  revalidatePath("/storefront");
  revalidatePath(`/s/${seller.slug}`, "layout");
  return {};
}

export async function saveCollectionAction(_prev: StorefrontFormState, form: FormData): Promise<StorefrontFormState> {
  const { session, seller } = await requireSeller();
  const values = {
    offersCollection: form.get("offersCollection") === "on",
    collectionAddress: String(form.get("collectionAddress") ?? ""),
    callNumber: String(form.get("callNumber") ?? ""),
  };
  const parsed = collectionSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  try {
    await saveCollection(session.user.id, seller.id, parsed.data);
  } catch (error) {
    return fail(error, values);
  }
  revalidatePath("/storefront");
  revalidatePath(`/s/${seller.slug}`, "layout");
  return { saved: true };
}
