"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fieldErrors, type FieldErrors } from "@/lib/auth-rules";
import { postInputFromForm, postInputSchema } from "@/lib/post-rules";
import { PostError, createDraft, deletePost, deletePostPhoto, publishPost, setPostHidden, updatePost } from "@/lib/posts";
import { requireSeller } from "@/lib/session";

// Proof Post actions. Post and photo ids are bound on the server pages but
// still arrive from the browser, so lib/posts re-checks ownership.

export type PostFormState = {
  errors?: FieldErrors;
  formError?: string;
  saved?: boolean;
  values?: { caption: string; productIds: string[] };
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const badRequest: PostFormState = { formError: "Something went wrong. Please try again." };

function fail(error: unknown, values?: PostFormState["values"]): PostFormState {
  if (error instanceof PostError) return { formError: error.message, values };
  // Log the failure type only; never the caption.
  console.error("[posts] action failed:", error instanceof Error ? error.name : typeof error);
  return { formError: "We couldn't save this. Please try again.", values };
}

function refresh(sellerSlug: string, postId?: string) {
  revalidatePath("/posts");
  if (postId) revalidatePath(`/posts/${postId}`);
  revalidatePath(`/s/${sellerSlug}`, "layout");
}

// Step one of posting: the post is saved as a draft, then the browser uploads
// its photos, then calls publishPostAction.
export async function createDraftAction(form: FormData): Promise<PostFormState & { postId?: string }> {
  const { session, seller } = await requireSeller();
  const values = postInputFromForm(form);
  const parsed = postInputSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  try {
    const post = await createDraft(session.user.id, seller.id, parsed.data);
    refresh(seller.slug);
    return { postId: post.id };
  } catch (error) {
    return fail(error, values);
  }
}

export async function publishPostAction(postId: string): Promise<PostFormState> {
  const { session, seller } = await requireSeller();
  if (!UUID.test(postId)) return badRequest;
  try {
    await publishPost(session.user.id, seller.id, postId);
  } catch (error) {
    return fail(error);
  }
  refresh(seller.slug, postId);
  return { saved: true };
}

export async function updatePostAction(postId: string, _prev: PostFormState, form: FormData): Promise<PostFormState> {
  const { session, seller } = await requireSeller();
  if (!UUID.test(postId)) return badRequest;
  const values = postInputFromForm(form);
  const parsed = postInputSchema.safeParse(values);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  try {
    await updatePost(session.user.id, seller.id, postId, parsed.data);
  } catch (error) {
    return fail(error, values);
  }
  refresh(seller.slug, postId);
  return { saved: true };
}

export async function setHiddenAction(postId: string, hidden: boolean): Promise<PostFormState> {
  const { session, seller } = await requireSeller();
  if (!UUID.test(postId) || typeof hidden !== "boolean") return badRequest;
  try {
    await setPostHidden(session.user.id, seller.id, postId, hidden);
  } catch (error) {
    return fail(error);
  }
  refresh(seller.slug, postId);
  return {};
}

export async function deletePostAction(postId: string): Promise<PostFormState> {
  const { session, seller } = await requireSeller();
  if (!UUID.test(postId)) return badRequest;
  try {
    await deletePost(session.user.id, seller.id, postId);
  } catch (error) {
    return fail(error);
  }
  refresh(seller.slug);
  redirect("/posts?deleted=1");
}

export async function deletePostPhotoAction(postId: string, mediaId: string): Promise<PostFormState> {
  const { session, seller } = await requireSeller();
  if (!UUID.test(postId) || !UUID.test(mediaId)) return badRequest;
  try {
    await deletePostPhoto(session.user.id, seller.id, mediaId);
  } catch (error) {
    return fail(error);
  }
  refresh(seller.slug, postId);
  return {};
}
