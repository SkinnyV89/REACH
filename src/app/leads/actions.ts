"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { leadStatusSchema } from "@/lib/lead-rules";
import { LeadError, updateLeadStatus } from "@/lib/leads";
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
