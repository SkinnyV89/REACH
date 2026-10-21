"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { leadStatusSchema } from "@/lib/lead-rules";
import { LeadError, deleteLead, updateLeadStatus } from "@/lib/leads";
import { requireSeller } from "@/lib/session";

export type LeadStatusResult = { ok: true } | { ok: false; error: string };

// The lead id comes from the browser; updateLeadStatus only matches a lead
// that belongs to the signed-in seller.
export async function updateLeadStatusAction(leadId: string, status: string): Promise<LeadStatusResult> {
  const { session, seller } = await requireSeller();
  const parsedStatus = leadStatusSchema.safeParse(status);
  if (!z.string().uuid().safeParse(leadId).success || !parsedStatus.success) {
    return { ok: false, error: "That update isn't valid." };
  }
  try {
    await updateLeadStatus(session.user.id, seller.id, leadId, parsedStatus.data);
  } catch (error) {
    if (error instanceof LeadError) return { ok: false, error: error.message };
    console.error("[leads] status update failed:", error instanceof Error ? error.name : typeof error);
    return { ok: false, error: "Couldn't save. Please try again." };
  }
  revalidatePath("/leads");
  return { ok: true };
}

// Permanent delete. The lead id comes from the browser; deleteLead only
// matches a lead that belongs to the signed-in seller.
export async function deleteLeadAction(leadId: string): Promise<LeadStatusResult> {
  const { session, seller } = await requireSeller();
  if (!z.string().uuid().safeParse(leadId).success) return { ok: false, error: "That lead couldn't be found." };
  try {
    await deleteLead(session.user.id, seller.id, leadId);
  } catch (error) {
    if (error instanceof LeadError) return { ok: false, error: error.message };
    console.error("[leads] delete failed:", error instanceof Error ? error.name : typeof error);
    return { ok: false, error: "Couldn't delete. Please try again." };
  }
  revalidatePath("/leads");
  return { ok: true };
}
