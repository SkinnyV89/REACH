"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CampaignError, generateMasterCampaign } from "@/lib/campaigns";
import { requireAdmin } from "@/lib/session";

export type GenerateResult =
  | { ok: true; masterCampaignId: string; source: "AI" | "TEMPLATE" }
  | { ok: false; error: string };

// Admin-only: generates and publishes a master campaign for a category.
// Each call can cost money (one or two AI requests), so it is never exposed
// to sellers. Wire an admin screen to this when admin tools are built.
export async function generateMasterCampaignAction(categoryId: string): Promise<GenerateResult> {
  const session = await requireAdmin();
  const parsed = z.string().uuid().safeParse(categoryId);
  if (!parsed.success) return { ok: false, error: "Invalid category." };

  try {
    const master = await generateMasterCampaign(session.user.id, parsed.data);
    revalidatePath("/campaigns");
    return { ok: true, masterCampaignId: master.id, source: master.source };
  } catch (error) {
    if (error instanceof CampaignError) return { ok: false, error: error.message };
    console.error("[campaigns] generation failed:", error instanceof Error ? error.name : typeof error);
    return { ok: false, error: "Something went wrong generating the campaign." };
  }
}
