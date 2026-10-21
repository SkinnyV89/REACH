"use server";

import { revalidatePath } from "next/cache";
import { MediaError, deleteProductPhoto, moveProductPhoto, updateAltText, type MoveAction } from "@/lib/media";
import { altTextSchema, uploadErrorMessage } from "@/lib/media-rules";
import { requireSeller } from "@/lib/session";

// Photo management on an item's edit page. Ids are bound on the server page
// but still arrive from the browser, so lib/media re-checks ownership.

export type PhotoActionState = { formError?: string; saved?: boolean };

function fail(error: unknown): PhotoActionState {
  if (error instanceof MediaError) return { formError: uploadErrorMessage(error.code) };
  console.error("[photos] action failed:", error instanceof Error ? error.name : typeof error);
  return { formError: "We couldn't update that photo. Please try again." };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MOVES: MoveAction[] = ["main", "earlier", "later"];
const badRequest: PhotoActionState = { formError: "Something went wrong. Please try again." };

function refresh(productId: string, sellerSlug: string) {
  revalidatePath(`/products/${productId}`);
  revalidatePath("/products");
  revalidatePath(`/s/${sellerSlug}`, "layout");
}

export async function deletePhotoAction(productId: string, mediaId: string): Promise<PhotoActionState> {
  const { session, seller } = await requireSeller();
  if (!UUID.test(productId) || !UUID.test(mediaId)) return badRequest;
  try {
    await deleteProductPhoto(session.user.id, seller.id, mediaId);
  } catch (error) {
    return fail(error);
  }
  refresh(productId, seller.slug);
  return {};
}

export async function movePhotoAction(productId: string, mediaId: string, move: MoveAction): Promise<PhotoActionState> {
  const { session, seller } = await requireSeller();
  if (!UUID.test(productId) || !UUID.test(mediaId) || !MOVES.includes(move)) return badRequest;
  try {
    await moveProductPhoto(session.user.id, seller.id, mediaId, move);
  } catch (error) {
    return fail(error);
  }
  refresh(productId, seller.slug);
  return {};
}

export async function altTextAction(productId: string, mediaId: string, _prev: PhotoActionState, form: FormData): Promise<PhotoActionState> {
  const { session, seller } = await requireSeller();
  if (!UUID.test(productId) || !UUID.test(mediaId)) return badRequest;
  const parsed = altTextSchema.safeParse(form.get("altText") ?? "");
  if (!parsed.success) return { formError: parsed.error.issues[0].message };
  try {
    await updateAltText(session.user.id, seller.id, mediaId, parsed.data);
  } catch (error) {
    return fail(error);
  }
  refresh(productId, seller.slug);
  return { saved: true };
}
