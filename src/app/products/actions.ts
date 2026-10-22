"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fieldErrors, type FieldErrors } from "@/lib/auth-rules";
import { z } from "zod";
import { MAX_PRODUCTS_PER_SELLER, bulkRowSchema, productSchema } from "@/lib/product-rules";
import { MAX_IMPORT_ITEMS, importRowSchema, toProductFields } from "@/lib/menu-import-rules";
import { ProductError, bulkUpdateItems, createProduct, createProducts, setArchived, updateProduct } from "@/lib/products";
import { formDataToObject } from "@/lib/seller-profile";
import { requireSeller } from "@/lib/session";

export type ProductFormState = {
  errors?: FieldErrors;
  formError?: string;
  values?: Record<string, unknown>;
};

function failure(error: unknown, values?: Record<string, unknown>): ProductFormState {
  if (error instanceof ProductError) return { formError: error.message, values };
  // Log the failure type only; never the submitted values.
  console.error("[products] save failed:", error instanceof Error ? error.name : typeof error);
  return { formError: "We couldn't save this. Please try again.", values };
}

export async function createProductAction(_prev: ProductFormState, form: FormData): Promise<ProductFormState> {
  const { session, seller } = await requireSeller();
  const values = formDataToObject(form);
  const parsed = productSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  let productId: string;
  try {
    productId = (await createProduct(session.user.id, seller.id, parsed.data)).id;
  } catch (error) {
    return failure(error, values);
  }
  revalidatePath("/products");
  // Straight to the item's page, where photos are added.
  redirect(`/products/${productId}?created=1#photos`);
}

// The product id is bound on the server page (`.bind(null, id)`), but it
// still arrives from the browser, so updateProduct re-checks ownership.
export async function updateProductAction(
  productId: string,
  _prev: ProductFormState,
  form: FormData,
): Promise<ProductFormState> {
  const { session, seller } = await requireSeller();
  const values = formDataToObject(form);
  const parsed = productSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  try {
    await updateProduct(session.user.id, seller.id, productId, parsed.data);
  } catch (error) {
    return failure(error, values);
  }
  revalidatePath("/products");
  redirect("/products?saved=updated");
}

export async function setArchivedAction(productId: string, archived: boolean): Promise<ProductFormState> {
  const { session, seller } = await requireSeller();
  try {
    await setArchived(session.user.id, seller.id, productId, archived);
  } catch (error) {
    return failure(error);
  }
  revalidatePath("/products");
  redirect(archived ? "/products?saved=archived" : "/products?saved=restored");
}

export type BulkState = { saved?: number; errors?: Record<string, string>; formError?: string };

// Quick price editing: every changed row is saved in one go, or none if any
// row has a problem.
export async function bulkUpdateAction(_prev: BulkState, form: FormData): Promise<BulkState> {
  const { session, seller } = await requireSeller();
  let rows: unknown;
  try {
    rows = JSON.parse(String(form.get("rows") ?? "[]"));
  } catch {
    return { formError: "Something went wrong. Please try again." };
  }
  const parsed = z.array(bulkRowSchema).max(MAX_PRODUCTS_PER_SELLER).safeParse(rows);
  if (!parsed.success) return { formError: "Something went wrong. Please try again." };
  try {
    const result = await bulkUpdateItems(session.user.id, seller.id, parsed.data);
    if (Object.keys(result.errors).length) return { errors: result.errors, formError: "Some prices need fixing. Nothing was saved yet." };
    revalidatePath("/products");
    revalidatePath(`/s/${seller.slug}`, "layout");
    return { saved: result.saved };
  } catch (error) {
    return { formError: failure(error).formError };
  }
}

export type ImportState = { errors?: Record<number, string>; formError?: string };

// Saves the reviewed draft from a flyer: every ticked row becomes an item, or
// nothing is saved if any row has a problem.
export async function importItemsAction(_prev: ImportState, form: FormData): Promise<ImportState> {
  const { session, seller } = await requireSeller();
  let rows: unknown;
  try {
    rows = JSON.parse(String(form.get("rows") ?? "[]"));
  } catch {
    return { formError: "Something went wrong. Please try again." };
  }
  const parsed = z.array(importRowSchema).max(MAX_IMPORT_ITEMS).safeParse(rows);
  if (!parsed.success) return { formError: "Something went wrong. Please try again." };
  if (parsed.data.length === 0) return { formError: "Tick at least one item to add." };

  const errors: Record<number, string> = {};
  const inputs = parsed.data.flatMap((row, i) => {
    const checked = productSchema.safeParse(toProductFields(row));
    if (checked.success) return [checked.data];
    errors[i] = checked.error.issues[0]?.message ?? "Check this item.";
    return [];
  });
  if (Object.keys(errors).length) return { errors, formError: "Some items need fixing. Nothing was saved yet." };

  let count: number;
  try {
    count = await createProducts(session.user.id, seller.id, inputs);
  } catch (error) {
    return { formError: failure(error).formError };
  }
  revalidatePath("/products");
  revalidatePath(`/s/${seller.slug}`, "layout");
  redirect(`/products?saved=imported&count=${count}`);
}
