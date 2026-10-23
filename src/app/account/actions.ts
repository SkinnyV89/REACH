"use server";

import { redirect } from "next/navigation";
import { AccountError, deleteBuyerAccount } from "@/lib/account";
import { requireSession } from "@/lib/session";

export type DeleteAccountState = { error?: string };

export async function deleteAccountAction(_prev: DeleteAccountState, form: FormData): Promise<DeleteAccountState> {
  const session = await requireSession();
  if (form.get("confirm") !== "DELETE") return { error: "Type DELETE to confirm." };
  try {
    // The account comes from the session, never from the form.
    await deleteBuyerAccount(session.user.id);
  } catch (error) {
    if (error instanceof AccountError) return { error: error.message };
    console.error("[account] delete failed:", error instanceof Error ? error.name : typeof error);
    return { error: "We couldn't delete your account. Please try again." };
  }
  // The session went with the account, so the old cookie no longer signs anyone in.
  redirect("/account-deleted");
}
