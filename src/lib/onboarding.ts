import "server-only";
import { db } from "@/lib/db";
import { Prisma, type FulfilmentOption, type Province, type Seller } from "@/generated/prisma/client";
import {
  slugCandidates,
  slugify,
  type BusinessStepInput,
  type CategoriesStepInput,
  type ExtrasStepInput,
} from "@/lib/seller-profile";

// Seller onboarding operations. Every function takes the user id from the
// verified session (never from the browser) and only ever touches the seller
// row owned by that user.

export type OnboardingStep = 1 | 2 | 3;

export class OnboardingError extends Error {
  constructor(
    public readonly code: "NO_SELLER" | "INVALID_CATEGORY" | "STEP_INCOMPLETE",
    message: string,
  ) {
    super(message);
  }
}

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

// Retries an operation that may lose a race on a unique constraint (two
// sellers claiming the same slug at once, or a double-submitted form).
// Each retry re-reads which slugs are taken; the short random pause stops
// concurrent losers from colliding again on the same next candidate.
async function withUniqueRetry<T>(operation: () => Promise<T>, attempts = 6): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await operation();
    } catch (error) {
      if (!isUniqueViolation(error) || i >= attempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 50 * i));
    }
  }
}

async function pickAvailableSlug(businessName: string): Promise<string> {
  const candidates = slugCandidates(slugify(businessName));
  const taken = await db.seller.findMany({
    where: { slug: { in: candidates } },
    select: { slug: true },
  });
  const takenSet = new Set(taken.map((s) => s.slug));
  const free = candidates.find((c) => !takenSet.has(c));
  // Very common names exhaust the numbered candidates; fall back to a random suffix.
  return free ?? `${candidates[0].slice(0, 40)}-${crypto.randomUUID().slice(0, 6)}`;
}

function audit(tx: Prisma.TransactionClient, userId: string, action: string, sellerId: string) {
  return tx.auditLog.create({ data: { actorId: userId, action, entity: "seller", entityId: sellerId } });
}

// Step 1. Creates the seller (with its permanent public slug) on first save;
// later saves update the details but never change the slug.
export async function saveBusinessStep(userId: string, input: BusinessStepInput): Promise<Seller> {
  return withUniqueRetry(async () => {
    const existing = await db.seller.findUnique({ where: { userId } });
    if (existing) {
      return db.$transaction(async (tx) => {
        const seller = await tx.seller.update({
          where: { userId },
          data: {
            businessName: input.businessName,
            whatsappNumber: input.whatsappNumber,
            description: input.description,
          },
        });
        await audit(tx, userId, "seller.business_updated", seller.id);
        return seller;
      });
    }

    const slug = await pickAvailableSlug(input.businessName);
    return db.$transaction(async (tx) => {
      const seller = await tx.seller.create({
        data: {
          userId,
          slug,
          businessName: input.businessName,
          whatsappNumber: input.whatsappNumber,
          description: input.description,
        },
      });
      await audit(tx, userId, "seller.created", seller.id);
      return seller;
    });
  });
}

// Step 2. Replaces the seller's categories and sets location and fulfilment.
export async function saveCategoriesStep(userId: string, input: CategoriesStepInput): Promise<Seller> {
  const seller = await db.seller.findUnique({ where: { userId }, select: { id: true } });
  if (!seller) throw new OnboardingError("NO_SELLER", "Complete your business details first.");

  const valid = await db.category.count({ where: { id: { in: input.categoryIds }, isActive: true } });
  if (valid !== input.categoryIds.length) {
    throw new OnboardingError("INVALID_CATEGORY", "One of the chosen categories is no longer available.");
  }

  return db.$transaction(async (tx) => {
    await tx.sellerCategory.deleteMany({ where: { sellerId: seller.id } });
    await tx.sellerCategory.createMany({
      data: input.categoryIds.map((categoryId) => ({ sellerId: seller.id, categoryId })),
    });
    const updated = await tx.seller.update({
      where: { id: seller.id },
      data: {
        province: input.province as Province,
        location: input.location,
        fulfilment: input.fulfilment as FulfilmentOption[],
        serviceArea: input.serviceArea,
      },
    });
    await audit(tx, userId, "seller.categories_updated", seller.id);
    return updated;
  });
}

// Step 3. Saves the optional links and marks onboarding complete.
export async function completeOnboarding(userId: string, input: ExtrasStepInput): Promise<Seller> {
  const seller = await db.seller.findUnique({
    where: { userId },
    select: { id: true, onboardedAt: true, _count: { select: { categories: true } } },
  });
  if (!seller) throw new OnboardingError("NO_SELLER", "Complete your business details first.");
  if (seller._count.categories === 0) {
    throw new OnboardingError("STEP_INCOMPLETE", "Choose what you sell before finishing.");
  }

  return db.$transaction(async (tx) => {
    const updated = await tx.seller.update({
      where: { id: seller.id },
      data: {
        instagramUrl: input.instagramUrl,
        facebookUrl: input.facebookUrl,
        tiktokUrl: input.tiktokUrl,
        websiteUrl: input.websiteUrl,
        status: "ACTIVE",
        onboardedAt: seller.onboardedAt ?? new Date(),
      },
    });
    await audit(tx, userId, seller.onboardedAt ? "seller.links_updated" : "seller.onboarded", seller.id);
    return updated;
  });
}

// The furthest step this seller may open: you cannot skip ahead of the
// information later steps depend on.
export function furthestStep(seller: { categoryCount: number } | null): OnboardingStep {
  if (!seller) return 1;
  if (seller.categoryCount === 0) return 2;
  return 3;
}

export async function getOnboardingState(userId: string) {
  const [seller, categories] = await Promise.all([
    db.seller.findUnique({
      where: { userId },
      include: { categories: { select: { categoryId: true } } },
    }),
    db.category.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, description: true },
    }),
  ]);
  return {
    seller,
    categories,
    selectedCategoryIds: seller?.categories.map((c) => c.categoryId) ?? [],
    furthest: furthestStep(seller ? { categoryCount: seller.categories.length } : null),
  };
}
