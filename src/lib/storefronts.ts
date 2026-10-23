import "server-only";
import { db } from "@/lib/db";
import { layoutForCategories, publishCheck, type StorefrontInput } from "@/lib/storefront-rules";

// Seller-side storefront management. Every function takes the seller id from
// requireSeller() and only touches that seller's row.

export class StorefrontError extends Error {
  constructor(
    public readonly code: "INVALID_PLACE" | "NOT_READY",
    message: string,
  ) {
    super(message);
  }
}

// Active places, Gauteng first (the launch area), then by province and name.
export async function listPlaces() {
  const places = await db.place.findMany({
    where: { isActive: true },
    select: { id: true, slug: true, name: true, province: true },
    orderBy: [{ province: "asc" }, { name: "asc" }],
  });
  return [...places.filter((p) => p.province === "GAUTENG"), ...places.filter((p) => p.province !== "GAUTENG")];
}

export async function getStorefrontEditor(sellerId: string) {
  const [seller, listingCount] = await Promise.all([
    db.seller.findUniqueOrThrow({
      where: { id: sellerId },
      select: {
        slug: true,
        businessName: true,
        tagline: true,
        description: true,
        placeId: true,
        areaDetail: true,
        location: true,
        province: true,
        serviceRadiusKm: true,
        fulfilment: true,
        layout: true,
        whatsappNumber: true,
        storefrontPublishedAt: true,
        place: { select: { name: true } },
        categories: { select: { category: { select: { slug: true } } } },
      },
    }),
    db.product.count({ where: { sellerId, status: { not: "ARCHIVED" } } }),
  ]);
  const check = publishCheck({
    hasLocation: Boolean(seller.placeId),
    listingCount,
    hasWhatsapp: Boolean(seller.whatsappNumber),
  });
  // Until the storefront is first saved (it has no place yet), suggest the
  // layout that fits what the seller sells rather than the generic default.
  const suggestedLayout = seller.placeId ? seller.layout : layoutForCategories(seller.categories.map((c) => c.category.slug));
  return { seller, listingCount, check, published: seller.storefrontPublishedAt !== null, suggestedLayout };
}

export async function saveStorefront(userId: string, sellerId: string, input: StorefrontInput) {
  const place = await db.place.findFirst({ where: { id: input.placeId, isActive: true }, select: { id: true, province: true } });
  if (!place) throw new StorefrontError("INVALID_PLACE", "Choose your town or city from the list.");
  await db.$transaction(async (tx) => {
    await tx.seller.update({
      where: { id: sellerId },
      data: {
        tagline: input.tagline,
        description: input.description,
        placeId: place.id,
        // Keep the profile's province consistent with the chosen place.
        province: place.province,
        areaDetail: input.areaDetail,
        serviceRadiusKm: input.serviceRadiusKm,
        layout: input.layout,
      },
    });
    await tx.auditLog.create({ data: { actorId: userId, action: "storefront.updated", entity: "seller", entityId: sellerId } });
  });
}

// Publishing makes /s/<slug> public (and indexable). Unpublishing hides it
// again immediately; shared links then show "isn't available".
export async function setStorefrontPublished(userId: string, sellerId: string, published: boolean) {
  if (published) {
    const { check } = await getStorefrontEditor(sellerId);
    if (!check.ok) throw new StorefrontError("NOT_READY", check.missing.join(" "));
  }
  await db.$transaction(async (tx) => {
    await tx.seller.update({
      where: { id: sellerId },
      data: { storefrontPublishedAt: published ? new Date() : null },
    });
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: published ? "storefront.published" : "storefront.unpublished",
        entity: "seller",
        entityId: sellerId,
      },
    });
  });
}
