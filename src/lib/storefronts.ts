import "server-only";
import { db } from "@/lib/db";
import { endOfSaDay, type HoursInput } from "@/lib/hours-rules";
import { pinProblem, roundPin, type CollectionInput } from "@/lib/location-rules";
import { layoutForCategories, publishCheck, type StorefrontInput } from "@/lib/storefront-rules";

// Seller-side storefront management. Every function takes the seller id from
// requireSeller() and only touches that seller's row.

export class StorefrontError extends Error {
  constructor(
    public readonly code: "INVALID_PLACE" | "NOT_READY" | "INVALID_PIN" | "NEEDS_PIN",
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

// ---------------------------------------------------------------------------
// Opening hours, collection point and call number
// ---------------------------------------------------------------------------

export async function getStorefrontSettings(sellerId: string) {
  const seller = await db.seller.findUniqueOrThrow({
    where: { id: sellerId },
    select: {
      pinLatitude: true,
      pinLongitude: true,
      offersCollection: true,
      collectionAddress: true,
      callNumber: true,
      closedUntil: true,
      hoursNote: true,
      place: { select: { name: true, latitude: true, longitude: true } },
      hours: { orderBy: [{ dayOfWeek: "asc" }, { opensAt: "asc" }], select: { dayOfWeek: true, opensAt: true, closesAt: true } },
    },
  });
  return seller;
}

// Replaces the weekly hours (and the short note) in one go.
export async function saveHours(userId: string, sellerId: string, input: HoursInput) {
  await db.$transaction(async (tx) => {
    await tx.sellerHours.deleteMany({ where: { sellerId } });
    if (input.slots.length) await tx.sellerHours.createMany({ data: input.slots.map((s) => ({ sellerId, ...s })) });
    await tx.seller.update({ where: { id: sellerId }, data: { hoursNote: input.note } });
    await tx.auditLog.create({ data: { actorId: userId, action: "storefront.hours_updated", entity: "seller", entityId: sellerId } });
  });
}

// "Closed today": closed until midnight South African time; or open again.
export async function setClosedToday(userId: string, sellerId: string, closed: boolean, now = new Date()) {
  await db.$transaction(async (tx) => {
    await tx.seller.update({ where: { id: sellerId }, data: { closedUntil: closed ? endOfSaDay(now) : null } });
    await tx.auditLog.create({
      data: { actorId: userId, action: closed ? "storefront.closed_today" : "storefront.reopened", entity: "seller", entityId: sellerId },
    });
  });
}

// Sets the shop pin from the seller's phone, while they're at the shop. It
// must be in South Africa and near their chosen town.
export async function setPin(userId: string, sellerId: string, latitude: number, longitude: number) {
  const seller = await db.seller.findUniqueOrThrow({
    where: { id: sellerId },
    select: { place: { select: { name: true, latitude: true, longitude: true } } },
  });
  const pin = { latitude: roundPin(latitude), longitude: roundPin(longitude) };
  const problem = pinProblem(pin, seller.place);
  if (problem) throw new StorefrontError("INVALID_PIN", problem);
  await db.$transaction(async (tx) => {
    await tx.seller.update({ where: { id: sellerId }, data: { pinLatitude: pin.latitude, pinLongitude: pin.longitude } });
    await tx.auditLog.create({ data: { actorId: userId, action: "storefront.pin_set", entity: "seller", entityId: sellerId } });
  });
  return pin;
}

// Removing the pin also stops collection (buyers would have nowhere to go).
export async function clearPin(userId: string, sellerId: string) {
  await db.$transaction(async (tx) => {
    await tx.seller.update({ where: { id: sellerId }, data: { pinLatitude: null, pinLongitude: null, offersCollection: false } });
    await tx.auditLog.create({ data: { actorId: userId, action: "storefront.pin_cleared", entity: "seller", entityId: sellerId } });
  });
}

export async function saveCollection(userId: string, sellerId: string, input: CollectionInput) {
  const { pinLatitude } = await db.seller.findUniqueOrThrow({ where: { id: sellerId }, select: { pinLatitude: true } });
  if (input.offersCollection && pinLatitude === null) {
    throw new StorefrontError("NEEDS_PIN", "Set your shop location first, so buyers can get directions.");
  }
  await db.$transaction(async (tx) => {
    await tx.seller.update({
      where: { id: sellerId },
      data: { offersCollection: input.offersCollection, collectionAddress: input.collectionAddress, callNumber: input.callNumber },
    });
    await tx.auditLog.create({ data: { actorId: userId, action: "storefront.collection_updated", entity: "seller", entityId: sellerId } });
  });
}
