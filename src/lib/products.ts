import "server-only";
import { db } from "@/lib/db";
import type { Prisma, ProductStatus } from "@/generated/prisma/client";
import { MAX_PRODUCTS_PER_SELLER, type ProductInput } from "@/lib/product-rules";
import { itemSlug, itemSlugCandidates, statusFromAvailability } from "@/lib/storefront-rules";

// Product and service operations. Every function takes the seller id from
// requireSeller() and scopes every query by it, so a seller can only ever
// read or change their own catalogue. A product id belonging to another
// seller behaves exactly like one that does not exist.

export class ProductError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "INVALID_CATEGORY" | "LIMIT_REACHED",
    message: string,
  ) {
    super(message);
  }
}

const listSelect = {
  id: true,
  kind: true,
  name: true,
  slug: true,
  availability: true,
  availabilityUpdatedAt: true,
  priceType: true,
  price: true,
  status: true,
  updatedAt: true,
  category: { select: { name: true } },
  photos: {
    orderBy: { position: "asc" },
    take: 1,
    select: { media: { select: { url: true, thumbUrl: true, width: true, height: true, altText: true } } },
  },
} satisfies Prisma.ProductSelect;

export async function listProducts(sellerId: string, { archived = false } = {}) {
  const products = await db.product.findMany({
    where: { sellerId, status: archived ? "ARCHIVED" : { not: "ARCHIVED" } },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    select: listSelect,
  });
  // Decimal is not serialisable to client components; hand out strings.
  return products.map(({ photos, ...p }) => ({ ...p, price: p.price?.toFixed(2) ?? null, photo: photos[0]?.media ?? null }));
}

export async function countProducts(sellerId: string) {
  const [active, archived] = await Promise.all([
    db.product.count({ where: { sellerId, status: { not: "ARCHIVED" } } }),
    db.product.count({ where: { sellerId, status: "ARCHIVED" } }),
  ]);
  return { active, archived };
}

export async function getProduct(sellerId: string, productId: string) {
  const product = await db.product.findFirst({ where: { id: productId, sellerId } });
  if (!product) return null;
  return { ...product, price: product.price?.toFixed(2) ?? null };
}

// Categories a seller may file products under: the ones on their profile.
// Keeping products inside the seller's categories keeps campaign matching
// consistent with what the seller told us they sell.
export async function sellerCategoryOptions(sellerId: string) {
  const rows = await db.sellerCategory.findMany({
    where: { sellerId, category: { isActive: true } },
    select: { category: { select: { id: true, name: true } } },
    orderBy: { category: { sortOrder: "asc" } },
  });
  return rows.map((r) => r.category);
}

async function assertSellerCategory(sellerId: string, categoryId: string) {
  const ok = await db.sellerCategory.findFirst({
    where: { sellerId, categoryId, category: { isActive: true } },
    select: { categoryId: true },
  });
  if (!ok) {
    throw new ProductError(
      "INVALID_CATEGORY",
      "Choose one of your business categories. You can add categories in your business profile.",
    );
  }
}

function toData(input: ProductInput) {
  return {
    kind: input.kind,
    name: input.name,
    categoryId: input.categoryId,
    description: input.description,
    priceType: input.priceType,
    price: input.price,
    availability: input.availability,
    leadTimeDays: input.leadTimeDays,
    // Mirrored for older code that reads status; archiving is separate.
    status: statusFromAvailability(input.availability),
  };
}

// A slug for this seller that is not used by another item, now or as an old
// (redirecting) address. `productId` lets an item keep or reclaim its own.
async function availableItemSlug(tx: Prisma.TransactionClient, sellerId: string, name: string, productId?: string) {
  const candidates = itemSlugCandidates(itemSlug(name));
  const [live, redirects] = await Promise.all([
    tx.product.findMany({ where: { sellerId, slug: { in: candidates } }, select: { id: true, slug: true } }),
    tx.productSlugRedirect.findMany({ where: { sellerId, slug: { in: candidates } }, select: { productId: true, slug: true } }),
  ]);
  const takenByOthers = new Set([
    ...live.filter((p) => p.id !== productId).map((p) => p.slug),
    ...redirects.filter((r) => r.productId !== productId).map((r) => r.slug),
  ]);
  return candidates.find((c) => !takenByOthers.has(c)) ?? `${candidates[0].slice(0, 50)}-${crypto.randomUUID().slice(0, 6)}`;
}

export async function createProduct(userId: string, sellerId: string, input: ProductInput) {
  await assertSellerCategory(sellerId, input.categoryId);
  return db.$transaction(async (tx) => {
    // Archived items count too, so archiving can't be used to bypass the limit.
    const existing = await tx.product.count({ where: { sellerId } });
    if (existing >= MAX_PRODUCTS_PER_SELLER) {
      throw new ProductError(
        "LIMIT_REACHED",
        `You can have up to ${MAX_PRODUCTS_PER_SELLER} products and services. Edit an existing one instead.`,
      );
    }
    const slug = await availableItemSlug(tx, sellerId, input.name);
    const product = await tx.product.create({ data: { sellerId, slug, ...toData(input) } });
    await tx.auditLog.create({
      data: { actorId: userId, action: "product.created", entity: "product", entityId: product.id },
    });
    return product;
  });
}

export async function updateProduct(userId: string, sellerId: string, productId: string, input: ProductInput) {
  await assertSellerCategory(sellerId, input.categoryId);
  return db.$transaction(async (tx) => {
    // Seller in the filter: a foreign id matches nothing.
    const current = await tx.product.findFirst({
      where: { id: productId, sellerId },
      select: { name: true, slug: true, availability: true },
    });
    if (!current) throw new ProductError("NOT_FOUND", "That product or service could not be found.");

    // Renamed: move to a new slug and keep the old one redirecting, so links
    // already shared keep working.
    let slug = current.slug;
    if (input.name !== current.name) {
      const next = await availableItemSlug(tx, sellerId, input.name, productId);
      if (next !== current.slug) {
        await tx.productSlugRedirect.upsert({
          where: { sellerId_slug: { sellerId, slug: current.slug } },
          create: { sellerId, slug: current.slug, productId },
          update: { productId },
        });
        // Renaming back to an old name reclaims that address from the redirects.
        await tx.productSlugRedirect.deleteMany({ where: { sellerId, slug: next, productId } });
        slug = next;
      }
    }
    await tx.product.update({
      where: { id: productId },
      data: {
        ...toData(input),
        slug,
        ...(input.availability !== current.availability ? { availabilityUpdatedAt: new Date() } : {}),
      },
    });
    await tx.auditLog.create({
      data: { actorId: userId, action: "product.updated", entity: "product", entityId: productId },
    });
  });
}

// Archiving hides an item without deleting it, so campaigns that already
// reference it keep their history. Restoring brings it back as available.
export async function setArchived(userId: string, sellerId: string, productId: string, archived: boolean) {
  const status: ProductStatus = archived ? "ARCHIVED" : "AVAILABLE";
  return db.$transaction(async (tx) => {
    const { count } = await tx.product.updateMany({
      where: { id: productId, sellerId, status: archived ? { not: "ARCHIVED" } : "ARCHIVED" },
      data: { status },
    });
    if (count === 0) throw new ProductError("NOT_FOUND", "That product or service could not be found.");
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: archived ? "product.archived" : "product.restored",
        entity: "product",
        entityId: productId,
      },
    });
  });
}
