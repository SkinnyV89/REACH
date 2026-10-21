"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fieldErrors, type FieldErrors } from "@/lib/auth-rules";
import { productSchema } from "@/lib/product-rules";
import { ProductError, createProduct, setArchived, updateProduct } from "@/lib/products";
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

  try {
    await createProduct(session.user.id, seller.id, parsed.data);
  } catch (error) {
    return failure(error, values);
  }
  revalidatePath("/products");
  redirect("/products?saved=created");
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
