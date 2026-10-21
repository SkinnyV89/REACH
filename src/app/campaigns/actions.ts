"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CampaignError, personaliseCampaign, setSellerCampaignStatus } from "@/lib/campaigns";
import { requireSeller } from "@/lib/session";

export type PersonaliseState = { formError?: string };

// masterId is bound on the server page but still arrives from the browser,
// so personaliseCampaign re-checks the master is in the seller's categories.
export async function personaliseAction(
  masterId: string,
  _prev: PersonaliseState,
  form: FormData,
): Promise<PersonaliseState> {
  const { session, seller } = await requireSeller();
  const rawProduct = String(form.get("productId") ?? "");
  const productId = rawProduct === "" ? null : rawProduct;
  if (!z.string().uuid().safeParse(masterId).success || (productId && !z.string().uuid().safeParse(productId).success)) {
    return { formError: "That campaign or product couldn't be found." };
  }

  let campaignId: string;
  try {
    campaignId = (await personaliseCampaign(session.user.id, seller, masterId, productId)).id;
  } catch (error) {
    if (error instanceof CampaignError) return { formError: error.message };
    console.error("[campaigns] personalise failed:", error instanceof Error ? error.name : typeof error);
    return { formError: "We couldn't create your campaign. Please try again." };
  }
  redirect(`/campaigns/${campaignId}?created=1`);
}

export type StatusState = { formError?: string };

export async function setCampaignStatusAction(
  campaignId: string,
  status: "ACTIVE" | "PAUSED",
): Promise<StatusState> {
  const { session, seller } = await requireSeller();
  if (!z.string().uuid().safeParse(campaignId).success) return { formError: "That campaign couldn't be found." };
  try {
    await setSellerCampaignStatus(session.user.id, seller.id, campaignId, status);
  } catch (error) {
    if (error instanceof CampaignError) return { formError: error.message };
    console.error("[campaigns] status change failed:", error instanceof Error ? error.name : typeof error);
    return { formError: "We couldn't update your campaign. Please try again." };
  }
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath("/campaigns");
  return {};
}
