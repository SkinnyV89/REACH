import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { AIError, AI_MODEL, AI_PROVIDER, generateStructured, isAIConfigured } from "@/lib/ai";
import { Prisma } from "@/generated/prisma/client";
import {
  describeViolations,
  generateShareCode,
  masterCopySchema,
  personaliseCopy,
  shareLinkPath,
  templateMasterCopy,
  validateMasterCopy,
  type MasterCopy,
} from "@/lib/campaign-rules";
import {
  MASTER_CAMPAIGN_SYSTEM_PROMPT,
  masterCampaignRetryPrompt,
  masterCampaignUserPrompt,
} from "@/lib/prompts/master-campaign";

export class CampaignError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "GENERATION_FAILED" | "INVALID_PRODUCT",
    message: string,
  ) {
    super(message);
  }
}

// First attempt plus one retry that tells the model which rules it broke.
export const MAX_GENERATION_ATTEMPTS = 2;

// ---------------------------------------------------------------------------
// Master campaigns (admin)
// ---------------------------------------------------------------------------

// Generates and publishes a master campaign for a category. Uses the
// configured AI model, or clearly labelled template copy when none is set.
// Every attempt is recorded as an AIJob; nothing is published unless the
// copy passes validateMasterCopy().
export async function generateMasterCampaign(requestedBy: string, categoryId: string) {
  const category = await db.category.findFirst({
    where: { id: categoryId, isActive: true },
    select: { id: true, name: true, description: true },
  });
  if (!category) throw new CampaignError("NOT_FOUND", "That category doesn't exist or isn't active.");

  const useAI = isAIConfigured();
  const job = await db.aIJob.create({
    data: {
      taskType: "CAMPAIGN_GENERATION",
      requestedBy,
      provider: useAI ? AI_PROVIDER : "template",
      model: useAI ? AI_MODEL : null,
    },
  });

  if (!useAI) {
    const copy = templateMasterCopy(category);
    return publish(job.id, requestedBy, category.id, copy, { source: "TEMPLATE", model: null, attempts: 0 });
  }

  const existingTitles = (
    await db.masterCampaign.findMany({
      where: { categoryId: category.id, status: "PUBLISHED" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { title: true },
    })
  ).map((m) => m.title);

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: masterCampaignUserPrompt({ category, existingTitles }) },
  ];
  const usage = { inputTokens: 0, outputTokens: 0 };

  for (let attempt = 1; attempt <= MAX_GENERATION_ATTEMPTS; attempt++) {
    let result;
    try {
      result = await generateStructured({
        system: MASTER_CAMPAIGN_SYSTEM_PROMPT,
        messages,
        schema: masterCopySchema,
        effort: "medium",
      });
    } catch (error) {
      const reason = error instanceof AIError ? `${error.kind}: ${error.message}` : "unexpected error";
      await failJob(job.id, attempt, usage, reason);
      throw new CampaignError("GENERATION_FAILED", `Campaign generation failed (${reason}).`);
    }
    usage.inputTokens += result.usage.inputTokens;
    usage.outputTokens += result.usage.outputTokens;

    const violations = validateMasterCopy(result.output);
    if (violations.length === 0) {
      return publish(job.id, requestedBy, category.id, result.output, {
        source: "AI",
        model: result.model,
        attempts: attempt,
        usage,
      });
    }

    if (attempt === MAX_GENERATION_ATTEMPTS) {
      const reason = `copy failed validation after ${attempt} attempts:\n${describeViolations(violations)}`;
      await failJob(job.id, attempt, usage, reason);
      throw new CampaignError(
        "GENERATION_FAILED",
        "The AI's campaign broke REACH's copy rules twice, so it wasn't published. Try again.",
      );
    }
    messages.push(
      { role: "assistant", content: result.content },
      { role: "user", content: masterCampaignRetryPrompt(describeViolations(violations)) },
    );
  }
  throw new Error("unreachable");
}

async function publish(
  jobId: string,
  userId: string,
  categoryId: string,
  copy: MasterCopy,
  meta: {
    source: "AI" | "TEMPLATE";
    model: string | null;
    attempts: number;
    usage?: { inputTokens: number; outputTokens: number };
  },
) {
  return db.$transaction(async (tx) => {
    const master = await tx.masterCampaign.create({
      data: {
        categoryId,
        title: copy.title.trim(),
        objective: copy.objective.trim(),
        headline: copy.headline.trim(),
        body: copy.body.trim(),
        callToAction: copy.call_to_action.trim(),
        source: meta.source,
        model: meta.model,
        aiJobId: jobId,
      },
    });
    await tx.aIJob.update({
      where: { id: jobId },
      data: {
        status: "SUCCEEDED",
        model: meta.model,
        attempts: meta.attempts,
        inputTokens: meta.usage?.inputTokens,
        outputTokens: meta.usage?.outputTokens,
        finishedAt: new Date(),
      },
    });
    await tx.auditLog.create({
      data: { actorId: userId, action: "master_campaign.generated", entity: "master_campaign", entityId: master.id },
    });
    return master;
  });
}

function failJob(jobId: string, attempts: number, usage: { inputTokens: number; outputTokens: number }, error: string) {
  return db.aIJob.update({
    where: { id: jobId },
    data: {
      status: "FAILED",
      attempts,
      inputTokens: usage.inputTokens || null,
      outputTokens: usage.outputTokens || null,
      error: error.slice(0, 2000),
      finishedAt: new Date(),
    },
  });
}

// ---------------------------------------------------------------------------
// Seller side. Every function takes the seller id from requireSeller().
// ---------------------------------------------------------------------------

const masterCardSelect = {
  id: true,
  title: true,
  headline: true,
  body: true,
  callToAction: true,
  source: true,
  createdAt: true,
  category: { select: { name: true } },
} satisfies Prisma.MasterCampaignSelect;

// Published masters in the seller's own categories, with the seller's own
// campaign for each (if they already personalised it).
export async function listCampaignLibrary(sellerId: string) {
  const masters = await db.masterCampaign.findMany({
    where: { status: "PUBLISHED", category: { isActive: true, sellers: { some: { sellerId } } } },
    orderBy: [{ category: { sortOrder: "asc" } }, { createdAt: "desc" }],
    select: {
      ...masterCardSelect,
      sellerCampaigns: { where: { sellerId }, select: { id: true } },
    },
  });
  return masters.map(({ sellerCampaigns, ...m }) => ({ ...m, sellerCampaignId: sellerCampaigns[0]?.id ?? null }));
}

// A master the seller may personalise: published and in one of their categories.
export async function getMasterForSeller(sellerId: string, masterId: string) {
  return db.masterCampaign.findFirst({
    where: {
      id: masterId,
      status: "PUBLISHED",
      category: { isActive: true, sellers: { some: { sellerId } } },
    },
    select: { ...masterCardSelect, objective: true },
  });
}

// Creates the seller's personalised campaign. Idempotent: personalising the
// same master again returns the existing campaign instead of a duplicate.
export async function personaliseCampaign(
  userId: string,
  seller: { id: string; slug: string; businessName: string; location: string | null },
  masterId: string,
  productId: string | null,
) {
  const master = await getMasterForSeller(seller.id, masterId);
  if (!master) throw new CampaignError("NOT_FOUND", "That campaign isn't available for your categories.");

  if (productId) {
    const product = await db.product.findFirst({
      where: { id: productId, sellerId: seller.id, status: { not: "ARCHIVED" } },
      select: { id: true },
    });
    if (!product) throw new CampaignError("INVALID_PRODUCT", "Choose one of your current products or services.");
  }

  const existing = await db.sellerCampaign.findUnique({
    where: { sellerId_masterCampaignId: { sellerId: seller.id, masterCampaignId: master.id } },
  });
  if (existing) return existing;

  const copy = personaliseCopy(master, { businessName: seller.businessName, location: seller.location });

  for (let attempt = 1; ; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        const campaign = await tx.sellerCampaign.create({
          data: {
            sellerId: seller.id,
            masterCampaignId: master.id,
            productId,
            uniqueLink: shareLinkPath(seller.slug, generateShareCode()),
            ...copy,
          },
        });
        await tx.auditLog.create({
          data: { actorId: userId, action: "seller_campaign.created", entity: "seller_campaign", entityId: campaign.id },
        });
        return campaign;
      });
    } catch (error) {
      const isUnique = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!isUnique || attempt >= 3) throw error;
      // Either a share-code collision (regenerate) or a double submit (return it).
      const raced = await db.sellerCampaign.findUnique({
        where: { sellerId_masterCampaignId: { sellerId: seller.id, masterCampaignId: master.id } },
      });
      if (raced) return raced;
    }
  }
}

export async function listSellerCampaigns(sellerId: string) {
  return db.sellerCampaign.findMany({
    where: { sellerId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      headline: true,
      status: true,
      uniqueLink: true,
      createdAt: true,
      masterCampaign: { select: { source: true, category: { select: { name: true } } } },
      product: { select: { name: true } },
    },
  });
}

export async function getSellerCampaign(sellerId: string, campaignId: string) {
  const campaign = await db.sellerCampaign.findFirst({
    where: { id: campaignId, sellerId },
    include: {
      masterCampaign: { select: { title: true, source: true, model: true, category: { select: { name: true } } } },
      product: { select: { name: true, kind: true, priceType: true, price: true, status: true } },
    },
  });
  if (!campaign) return null;
  const product = campaign.product && { ...campaign.product, price: campaign.product.price?.toFixed(2) ?? null };
  return { ...campaign, product };
}
