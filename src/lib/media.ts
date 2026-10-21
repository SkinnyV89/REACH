import "server-only";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import type { MediaKind, Prisma } from "@/generated/prisma/client";
import { ImageError, processImage } from "@/lib/images";
import {
  MAX_PRODUCT_PHOTOS,
  MEDIA_KIND_FOR_TARGET,
  UPLOADS_PER_HOUR,
  needsPeopleConsent,
  type UploadErrorCode,
  type UploadTarget,
} from "@/lib/media-rules";
import { hit } from "@/lib/public-campaigns";
import { StorageNotConfiguredError, getStorage, type Storage } from "@/lib/storage";

// Seller photos: logo, cover photo and up to six photos per item. Every
// function takes the seller id from requireSeller() and scopes every query by
// it; another seller's photo or item behaves exactly like a missing one.
//
// Order of work on upload: check → re-encode (strips metadata) → store files
// → save rows. If saving the rows fails, the stored files are deleted, and
// files of a replaced or removed photo are deleted after its row is gone.

export class MediaError extends Error {
  constructor(public readonly code: UploadErrorCode) {
    super(code);
  }
}

export const mediaSelect = {
  id: true,
  url: true,
  thumbUrl: true,
  width: true,
  height: true,
  altText: true,
} satisfies Prisma.MediaSelect;

export type MediaView = Prisma.MediaGetPayload<{ select: typeof mediaSelect }>;

function resolveStorage(storage?: Storage): Storage {
  try {
    return storage ?? getStorage();
  } catch (error) {
    if (error instanceof StorageNotConfiguredError) throw new MediaError("storage_not_configured");
    throw error;
  }
}

// Deleting files is best effort: a leftover file is harmless (nothing links
// to it), while failing the seller's action over it would not be.
async function deleteFiles(storage: Storage, keys: string[]) {
  try {
    await storage.delete(keys);
  } catch (error) {
    console.error("[media] file delete failed:", error instanceof Error ? error.name : typeof error);
  }
}

// Locks the seller's item for the rest of the transaction, so concurrent
// uploads, reorders and deletes on the same item run one at a time.
async function lockProduct(tx: Prisma.TransactionClient, sellerId: string, productId: string, { allowArchived = true } = {}) {
  const rows = await tx.$queryRaw<{ status: string }[]>`
    SELECT "status"::text FROM "products" WHERE "id" = ${productId} AND "seller_id" = ${sellerId} FOR UPDATE`;
  if (rows.length === 0 || (!allowArchived && rows[0].status === "ARCHIVED")) throw new MediaError("not_found");
}

// Locks the seller's row and returns their current logo or cover photo id,
// so two uploads of a new logo can't both replace the same old one.
async function lockSellerImage(tx: Prisma.TransactionClient, sellerId: string, target: "logo" | "cover") {
  const rows = await tx.$queryRaw<{ logo: string | null; cover: string | null }[]>`
    SELECT "logo_media_id" AS "logo", "cover_media_id" AS "cover" FROM "sellers" WHERE "id" = ${sellerId} FOR UPDATE`;
  if (rows.length === 0) throw new MediaError("not_found");
  return rows[0][target];
}

// Rewrites an item's photo positions as 0, 1, 2... in the given order.
async function writeOrder(tx: Prisma.TransactionClient, productId: string, mediaIds: string[]) {
  await tx.productMedia.deleteMany({ where: { productId } });
  if (mediaIds.length > 0) {
    await tx.productMedia.createMany({ data: mediaIds.map((mediaId, position) => ({ productId, mediaId, position })) });
  }
}

async function currentOrder(tx: Prisma.TransactionClient, productId: string) {
  const rows = await tx.productMedia.findMany({ where: { productId }, orderBy: { position: "asc" }, select: { mediaId: true } });
  return rows.map((r) => r.mediaId);
}

export type UploadInput = {
  userId: string;
  sellerId: string;
  target: UploadTarget;
  productId: string | null;
  data: Buffer;
  altText: string | null;
  peopleConsent: boolean;
};

export async function uploadImage(input: UploadInput, storageOverride?: Storage): Promise<MediaView> {
  const { userId, sellerId, target, productId } = input;
  const storage = resolveStorage(storageOverride);

  if (needsPeopleConsent(target) && !input.peopleConsent) throw new MediaError("consent_required");
  if (target === "product") {
    if (!productId) throw new MediaError("not_found");
    // Early check so a full item doesn't cost a re-encode; the locked check
    // below (and the database constraint) is the real guard.
    const product = await db.product.findFirst({
      where: { id: productId, sellerId, status: { not: "ARCHIVED" } },
      select: { _count: { select: { photos: true } } },
    });
    if (!product) throw new MediaError("not_found");
    if (product._count.photos >= MAX_PRODUCT_PHOTOS) throw new MediaError("limit_reached");
  }
  if ((await hit(`upload:${sellerId}`, 60)) > UPLOADS_PER_HOUR) throw new MediaError("rate_limited");

  let images;
  try {
    images = await processImage(input.data, target);
  } catch (error) {
    if (error instanceof ImageError) throw new MediaError(error.code);
    throw error;
  }

  const mediaId = randomUUID();
  const keys = images.map((img) => `media/${mediaId}/${img.name}.webp`);
  const stored = await Promise.allSettled(images.map((img, i) => storage.put(keys[i], img.data, img.contentType)));
  if (stored.some((s) => s.status === "rejected")) {
    await deleteFiles(storage, keys.filter((_, i) => stored[i].status === "fulfilled"));
    console.error("[media] file store failed");
    throw new MediaError("failed");
  }
  const urls = Object.fromEntries(images.map((img, i) => [img.name, (stored[i] as PromiseFulfilledResult<{ url: string }>).value.url]));
  const large = images.find((img) => img.name === "lg")!;

  let replacedKeys: string[] = [];
  try {
    const media = await db.$transaction(async (tx) => {
      // Take locks before inserting: the insert's foreign-key check also
      // locks the seller row, and taking that first would deadlock.
      let oldSellerImageId: string | null = null;
      if (target === "product") await lockProduct(tx, sellerId, productId!, { allowArchived: false });
      else oldSellerImageId = await lockSellerImage(tx, sellerId, target);
      const media = await tx.media.create({
        data: {
          id: mediaId,
          sellerId,
          kind: MEDIA_KIND_FOR_TARGET[target] as MediaKind,
          storageKeys: keys,
          url: urls.lg,
          thumbUrl: urls.sm ?? urls.lg,
          width: large.width,
          height: large.height,
          bytes: images.reduce((n, img) => n + img.data.length, 0),
          altText: input.altText,
          peopleConsentAt: needsPeopleConsent(target) ? new Date() : null,
        },
        select: mediaSelect,
      });

      if (target === "product") {
        const order = await currentOrder(tx, productId!);
        if (order.length >= MAX_PRODUCT_PHOTOS) throw new MediaError("limit_reached");
        await tx.productMedia.create({ data: { productId: productId!, mediaId, position: order.length } });
      } else {
        await tx.seller.update({ where: { id: sellerId }, data: target === "logo" ? { logoMediaId: mediaId } : { coverMediaId: mediaId } });
        if (oldSellerImageId) {
          const old = await tx.media.findFirst({ where: { id: oldSellerImageId, sellerId }, select: { storageKeys: true } });
          await tx.media.deleteMany({ where: { id: oldSellerImageId, sellerId } });
          replacedKeys = old?.storageKeys ?? [];
        }
      }
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: target === "product" ? "media.product_photo_added" : `media.${target}_set`,
          entity: "media",
          entityId: mediaId,
        },
      });
      return media;
    });
    await deleteFiles(storage, replacedKeys);
    return media;
  } catch (error) {
    await deleteFiles(storage, keys);
    throw error;
  }
}

// Removes the seller's logo or cover photo.
export async function removeSellerImage(userId: string, sellerId: string, target: "logo" | "cover", storageOverride?: Storage) {
  const storage = resolveStorage(storageOverride);
  const keys = await db.$transaction(async (tx) => {
    const id = await lockSellerImage(tx, sellerId, target);
    if (!id) return null;
    const media = await tx.media.findFirst({ where: { id, sellerId }, select: { storageKeys: true } });
    // The seller's link is cleared by the foreign key (ON DELETE SET NULL).
    await tx.media.deleteMany({ where: { id, sellerId } });
    await tx.auditLog.create({ data: { actorId: userId, action: `media.${target}_removed`, entity: "media", entityId: id } });
    return media?.storageKeys ?? [];
  });
  if (keys) await deleteFiles(storage, keys);
}

async function findProductPhoto(tx: Prisma.TransactionClient, sellerId: string, mediaId: string) {
  const media = await tx.media.findFirst({
    where: { id: mediaId, sellerId, kind: "PRODUCT" },
    select: { storageKeys: true, productPhoto: { select: { productId: true } } },
  });
  if (!media?.productPhoto) throw new MediaError("not_found");
  return { storageKeys: media.storageKeys, productId: media.productPhoto.productId };
}

export async function deleteProductPhoto(userId: string, sellerId: string, mediaId: string, storageOverride?: Storage) {
  const storage = resolveStorage(storageOverride);
  const keys = await db.$transaction(async (tx) => {
    const { productId, storageKeys } = await findProductPhoto(tx, sellerId, mediaId);
    await lockProduct(tx, sellerId, productId);
    const order = (await currentOrder(tx, productId)).filter((id) => id !== mediaId);
    await tx.media.deleteMany({ where: { id: mediaId, sellerId } });
    await writeOrder(tx, productId, order); // close the gap
    await tx.auditLog.create({ data: { actorId: userId, action: "media.product_photo_deleted", entity: "media", entityId: mediaId } });
    return storageKeys;
  });
  await deleteFiles(storage, keys);
}

export type MoveAction = "main" | "earlier" | "later";

export async function moveProductPhoto(userId: string, sellerId: string, mediaId: string, action: MoveAction) {
  await db.$transaction(async (tx) => {
    const { productId } = await findProductPhoto(tx, sellerId, mediaId);
    await lockProduct(tx, sellerId, productId);
    const order = await currentOrder(tx, productId);
    const i = order.indexOf(mediaId);
    const j = action === "main" ? 0 : action === "earlier" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= order.length || i === j) return;
    order.splice(i, 1);
    order.splice(j, 0, mediaId);
    await writeOrder(tx, productId, order);
    await tx.auditLog.create({ data: { actorId: userId, action: "media.product_photos_reordered", entity: "product", entityId: productId } });
  });
}

export async function updateAltText(userId: string, sellerId: string, mediaId: string, altText: string | null) {
  await db.$transaction(async (tx) => {
    const { count } = await tx.media.updateMany({ where: { id: mediaId, sellerId }, data: { altText } });
    if (count === 0) throw new MediaError("not_found");
    await tx.auditLog.create({ data: { actorId: userId, action: "media.alt_text_updated", entity: "media", entityId: mediaId } });
  });
}

export async function listProductPhotos(sellerId: string, productId: string): Promise<MediaView[]> {
  const rows = await db.productMedia.findMany({
    where: { productId, product: { sellerId } },
    orderBy: { position: "asc" },
    select: { media: { select: mediaSelect } },
  });
  return rows.map((r) => r.media);
}

export async function getSellerImages(sellerId: string) {
  const seller = await db.seller.findUniqueOrThrow({
    where: { id: sellerId },
    select: { logo: { select: mediaSelect }, cover: { select: mediaSelect } },
  });
  return { logo: seller.logo, cover: seller.cover };
}
