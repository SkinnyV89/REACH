import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { generateShareCode } from "@/lib/campaign-rules";
import { MediaError, deleteFiles, lockPost, resolveStorage } from "@/lib/media";
import { notifyFollowersOfPost } from "@/lib/notifications";
import { POST_CODE_LENGTH, type PostInput } from "@/lib/post-rules";
import type { Storage } from "@/lib/storage";

// Proof Posts, seller side. Every function takes the seller id from
// requireSeller() and scopes every query by it; another seller's post behaves
// exactly like a missing one.
//
// Lifecycle: DRAFT (created, photos being added) → PUBLISHED ⇄ HIDDEN.
// REMOVED is set by REACH only and can't be undone by the seller.

export class PostError extends Error {
  constructor(
    public readonly code: "NOT_FOUND" | "INVALID_PRODUCT" | "NO_PHOTOS" | "NOT_DRAFT" | "REMOVED" | "LAST_PHOTO" | "TOO_MANY_DRAFTS",
    message: string,
  ) {
    super(message);
  }
}

// Unfinished posts a seller can have at once (each one may hold photos).
export const MAX_DRAFTS = 10;

const notFound = () => new PostError("NOT_FOUND", "That post could not be found.");

async function locked(tx: Prisma.TransactionClient, sellerId: string, postId: string) {
  try {
    return await lockPost(tx, sellerId, postId);
  } catch (error) {
    if (error instanceof MediaError) throw notFound();
    throw error;
  }
}

// Tags must be the seller's own, current (not archived) items.
async function assertOwnProducts(tx: Prisma.TransactionClient, sellerId: string, productIds: string[]) {
  if (productIds.length === 0) return;
  const found = await tx.product.count({ where: { id: { in: productIds }, sellerId, status: { not: "ARCHIVED" } } });
  if (found !== productIds.length) throw new PostError("INVALID_PRODUCT", "Tag items from your own list.");
}

export async function createDraft(userId: string, sellerId: string, input: PostInput) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await db.$transaction(async (tx) => {
        // Serialise per seller so the draft cap holds under double submits.
        await tx.$queryRaw`SELECT "id" FROM "sellers" WHERE "id" = ${sellerId} FOR UPDATE`;
        const drafts = await tx.post.count({ where: { sellerId, status: "DRAFT" } });
        if (drafts >= MAX_DRAFTS) {
          throw new PostError("TOO_MANY_DRAFTS", "Finish or delete your unfinished posts before starting another.");
        }
        await assertOwnProducts(tx, sellerId, input.productIds);
        const post = await tx.post.create({
          data: {
            sellerId,
            code: generateShareCode(POST_CODE_LENGTH),
            caption: input.caption,
            products: { create: input.productIds.map((productId) => ({ productId })) },
          },
          select: { id: true, code: true },
        });
        await tx.auditLog.create({ data: { actorId: userId, action: "post.created", entity: "post", entityId: post.id } });
        return post;
      });
    } catch (error) {
      // A post-code collision (~59 bits of randomness): try a new code.
      const collision = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!collision || attempt >= 3) throw error;
    }
  }
}

export async function publishPost(userId: string, sellerId: string, postId: string) {
  await db.$transaction(async (tx) => {
    const status = await locked(tx, sellerId, postId);
    if (status !== "DRAFT") throw new PostError("NOT_DRAFT", "This post has already been published.");
    if ((await tx.postMedia.count({ where: { postId } })) === 0) {
      throw new PostError("NO_PHOTOS", "Add at least one photo before posting.");
    }
    await tx.post.update({ where: { id: postId }, data: { status: "PUBLISHED", publishedAt: new Date() } });
    await tx.auditLog.create({ data: { actorId: userId, action: "post.published", entity: "post", entityId: postId } });
  });
  // Tell followers, after the post is saved. A failure here never undoes or
  // blocks the post; it's logged (without personal data) instead.
  try {
    await notifyFollowersOfPost(sellerId, postId);
  } catch (error) {
    console.error("[posts] follower notifications failed:", error instanceof Error ? error.name : typeof error);
  }
}

export async function updatePost(userId: string, sellerId: string, postId: string, input: PostInput) {
  await db.$transaction(async (tx) => {
    if ((await locked(tx, sellerId, postId)) === "REMOVED") throw new PostError("REMOVED", "This post was removed by REACH.");
    await assertOwnProducts(tx, sellerId, input.productIds);
    await tx.post.update({ where: { id: postId }, data: { caption: input.caption } });
    // Replace the current tags. Tags on archived items aren't editable (or
    // shown); they're kept so they come back if the item is restored.
    await tx.postProduct.deleteMany({ where: { postId, product: { status: { not: "ARCHIVED" } } } });
    if (input.productIds.length > 0) {
      await tx.postProduct.createMany({ data: input.productIds.map((productId) => ({ postId, productId })), skipDuplicates: true });
    }
    await tx.auditLog.create({ data: { actorId: userId, action: "post.updated", entity: "post", entityId: postId } });
  });
}

export async function setPostHidden(userId: string, sellerId: string, postId: string, hidden: boolean) {
  await db.$transaction(async (tx) => {
    const status = await locked(tx, sellerId, postId);
    if (status !== (hidden ? "PUBLISHED" : "HIDDEN")) {
      throw new PostError("NOT_FOUND", hidden ? "Only published posts can be hidden." : "This post isn't hidden.");
    }
    await tx.post.update({ where: { id: postId }, data: { status: hidden ? "HIDDEN" : "PUBLISHED" } });
    await tx.auditLog.create({
      data: { actorId: userId, action: hidden ? "post.hidden" : "post.unhidden", entity: "post", entityId: postId },
    });
  });
}

// Deletes the post, its photos and their files.
export async function deletePost(userId: string, sellerId: string, postId: string, storageOverride?: Storage) {
  const keys = await db.$transaction(async (tx) => {
    await locked(tx, sellerId, postId);
    const media = await tx.media.findMany({
      where: { sellerId, postPhoto: { postId } },
      select: { id: true, storageKeys: true },
    });
    await tx.media.deleteMany({ where: { id: { in: media.map((m) => m.id) }, sellerId } });
    await tx.post.delete({ where: { id: postId } });
    await tx.auditLog.create({ data: { actorId: userId, action: "post.deleted", entity: "post", entityId: postId } });
    return media.flatMap((m) => m.storageKeys);
  });
  if (keys.length > 0) await deleteFiles(resolveStorage(storageOverride), keys);
}

// Removes one photo. A published post keeps at least one.
export async function deletePostPhoto(userId: string, sellerId: string, mediaId: string, storageOverride?: Storage) {
  const keys = await db.$transaction(async (tx) => {
    const media = await tx.media.findFirst({
      where: { id: mediaId, sellerId, kind: "POST" },
      select: { storageKeys: true, postPhoto: { select: { postId: true } } },
    });
    if (!media?.postPhoto) throw new PostError("NOT_FOUND", "That photo could not be found.");
    const postId = media.postPhoto.postId;
    const status = await locked(tx, sellerId, postId);
    const order = (await tx.postMedia.findMany({ where: { postId }, orderBy: { position: "asc" }, select: { mediaId: true } })).map(
      (r) => r.mediaId,
    );
    if (status !== "DRAFT" && order.length <= 1) {
      throw new PostError("LAST_PHOTO", "A post needs at least one photo. Delete the post instead.");
    }
    await tx.media.deleteMany({ where: { id: mediaId, sellerId } });
    // Close the gap: positions 0, 1, 2...
    const rest = order.filter((id) => id !== mediaId);
    await tx.postMedia.deleteMany({ where: { postId } });
    if (rest.length > 0) await tx.postMedia.createMany({ data: rest.map((id, position) => ({ postId, mediaId: id, position })) });
    await tx.auditLog.create({ data: { actorId: userId, action: "media.post_photo_deleted", entity: "media", entityId: mediaId } });
    return media.storageKeys;
  });
  await deleteFiles(resolveStorage(storageOverride), keys);
}

const photoSelect = {
  id: true,
  url: true,
  thumbUrl: true,
  width: true,
  height: true,
  altText: true,
  captureSource: true,
  capturedAt: true,
} satisfies Prisma.MediaSelect;

export async function listSellerPosts(sellerId: string) {
  const posts = await db.post.findMany({
    where: { sellerId, status: { not: "REMOVED" } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      code: true,
      caption: true,
      status: true,
      publishedAt: true,
      createdAt: true,
      media: { orderBy: { position: "asc" }, take: 1, select: { media: { select: photoSelect } } },
      _count: { select: { media: true, products: true } },
    },
  });
  return posts.map(({ media, _count, ...p }) => ({ ...p, photo: media[0]?.media ?? null, photoCount: _count.media, tagCount: _count.products }));
}

export async function getSellerPost(sellerId: string, postId: string) {
  const post = await db.post.findFirst({
    where: { id: postId, sellerId },
    select: {
      id: true,
      code: true,
      caption: true,
      status: true,
      publishedAt: true,
      createdAt: true,
      media: { orderBy: { position: "asc" }, select: { media: { select: photoSelect } } },
      products: { orderBy: { product: { name: "asc" } }, select: { product: { select: { id: true, name: true, status: true } } } },
    },
  });
  if (!post) return null;
  return {
    ...post,
    media: post.media.map((m) => m.media),
    products: post.products.map((p) => p.product),
  };
}

// The seller's current items, for tagging.
export async function taggableProducts(sellerId: string) {
  return db.product.findMany({
    where: { sellerId, status: { not: "ARCHIVED" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, kind: true },
  });
}
