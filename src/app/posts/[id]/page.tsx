import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CaptureExplainer, CaptureLabel } from "@/components/capture-label";
import { Photo } from "@/components/photo";
import { PhotoUpload } from "@/components/photo-upload";
import { SellerHeader } from "@/components/seller-header";
import { MAX_POST_PHOTOS, formatPostedDate } from "@/lib/post-rules";
import { getSellerPost, taggableProducts } from "@/lib/posts";
import { requireSeller } from "@/lib/session";
import { isStorageConfigured } from "@/lib/storage";
import { deletePostAction, deletePostPhotoAction, publishPostAction, setHiddenAction, updatePostAction } from "../actions";
import { ActionButton, ConfirmButton, PostEditForm } from "./post-controls";

export const metadata: Metadata = { title: "Post · REACH" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const STATUS = {
  DRAFT: { title: "Not finished", text: "Only you can see this. Add photos and post it when you're ready.", className: "bg-amber-100 text-amber-900" },
  PUBLISHED: { title: "Posted", text: "Shown on your storefront.", className: "bg-brand-100 text-brand-700" },
  HIDDEN: { title: "Hidden", text: "Hidden from your storefront. Only you can see it.", className: "bg-ink-100 text-ink-700" },
  REMOVED: { title: "Removed by REACH", text: "This post was removed and can't be shown again. You can still delete it.", className: "bg-red-100 text-red-800" },
} as const;

export default async function PostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ posted?: string; incomplete?: string }>;
}) {
  const { session, seller } = await requireSeller();
  const { id } = await params;
  const sp = await searchParams;
  // Another seller's post looks exactly like a missing one.
  const post = UUID.test(id) ? await getSellerPost(seller.id, id) : null;
  if (!post) notFound();
  const products = await taggableProducts(seller.id);

  const status = STATUS[post.status];
  const isDraft = post.status === "DRAFT";
  const publicUrl = `/s/${seller.slug}/posts/${post.code}`;
  const storefrontLive = seller.storefrontPublishedAt !== null;
  const failed = Number(sp.incomplete ?? 0);
  // Archived items stay tagged (kept for when they're restored) but aren't shown to buyers.
  const archivedTags = post.products.filter((p) => p.status === "ARCHIVED");

  return (
    <div className="min-h-screen bg-ink-100">
      <SellerHeader email={session.user.email} current="posts" />
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        <Link href="/posts" className="text-sm font-semibold text-brand-700 hover:underline">
          ← All posts
        </Link>

        {sp.posted && post.status === "PUBLISHED" && (
          <p role="status" className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
            Posted.{" "}
            {storefrontLive ? "It's on your storefront now." : "Customers will see it once you publish your storefront."}
          </p>
        )}
        {isDraft && failed > 0 && (
          <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {failed === 1 ? "1 photo didn't upload." : `${failed} photos didn't upload.`} Add {failed === 1 ? "it" : "them"} again below, or post with
            the photos you have.
          </p>
        )}

        <section className="rounded-2xl border border-ink-300/60 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-2xl font-bold text-ink-900">Your post</h1>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}>{status.title}</span>
          </div>
          <p className="mt-1 text-sm text-ink-500">
            {status.text} {post.publishedAt && formatPostedDate(post.publishedAt)}
          </p>
          {post.status !== "REMOVED" && (
            <a href={publicUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm font-semibold text-brand-700 hover:underline">
              {post.status === "PUBLISHED" && storefrontLive ? "View on your storefront" : "Preview"} ↗
            </a>
          )}

          <div className="mt-5">
            <div className="flex items-baseline justify-between">
              <h2 className="font-semibold text-ink-900">Photos</h2>
              <span className="text-sm text-ink-500">
                {post.media.length} of {MAX_POST_PHOTOS}
              </span>
            </div>
            {post.media.length > 0 && (
              <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {post.media.map((m, i) => (
                  <li key={m.id} className="overflow-hidden rounded-xl border border-ink-300/60">
                    <div className="relative aspect-square bg-ink-100">
                      <Photo photo={m} alt={`Photo ${i + 1}`} sizes="(min-width: 640px) 200px, 50vw" className="h-full w-full object-cover" />
                      <CaptureLabel source={m.captureSource} capturedAt={m.capturedAt} className="absolute bottom-2 left-2" />
                    </div>
                    <div className="p-2">
                      {!isDraft && post.media.length === 1 ? (
                        <p className="text-xs text-ink-500">A post needs at least one photo.</p>
                      ) : (
                        <ConfirmButton
                          action={deletePostPhotoAction.bind(null, post.id, m.id)}
                          label={`Remove photo ${i + 1}`}
                          question="Remove this photo? It will be deleted."
                          confirmLabel="Yes, remove"
                          small
                        />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-3">
              <CaptureExplainer sources={post.media.map((m) => m.captureSource)} />
            </div>
            {isDraft && (
              <div className="mt-4 space-y-4 border-t border-ink-100 pt-4">
                {post.media.length < MAX_POST_PHOTOS && (
                  <PhotoUpload
                    target="post"
                    postId={post.id}
                    remaining={MAX_POST_PHOTOS - post.media.length}
                    label={post.media.length === 0 ? "Add photos" : "Add more photos"}
                    disabledText={isStorageConfigured() ? undefined : "Photo uploads aren't set up on this server yet."}
                  />
                )}
                <ActionButton action={publishPostAction.bind(null, post.id)} label="Post now" pendingLabel="Posting…" primary disabled={post.media.length === 0} />
                {post.media.length === 0 && <p className="text-xs text-ink-500">Add at least one photo to post.</p>}
              </div>
            )}
            {!isDraft && <p className="mt-3 text-xs text-ink-500">Photos can&apos;t be added after posting. To show different photos, make a new post.</p>}
          </div>
        </section>

        {post.status !== "REMOVED" && (
          <section aria-labelledby="details" className="rounded-2xl border border-ink-300/60 bg-white p-5 sm:p-6">
            <h2 id="details" className="font-semibold text-ink-900">
              Caption and tags
            </h2>
            {archivedTags.length > 0 && (
              <p className="mt-1 text-sm text-ink-500">
                Also tagged, but archived so not shown on the post: {archivedTags.map((p) => p.name).join(", ")}. The tag comes back if you
                restore the item.
              </p>
            )}
            <div className="mt-4">
              <PostEditForm
                action={updatePostAction.bind(null, post.id)}
                products={products}
                initial={{ caption: post.caption, productIds: post.products.filter((p) => p.status !== "ARCHIVED").map((p) => p.id) }}
              />
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-ink-300/60 bg-white p-5 sm:p-6">
          <h2 className="font-semibold text-ink-900">Show or delete</h2>
          <div className="mt-3 space-y-4">
            {post.status === "PUBLISHED" && (
              <div>
                <p className="mb-2 text-sm text-ink-500">Hide it from your storefront without deleting it.</p>
                <ActionButton action={setHiddenAction.bind(null, post.id, true)} label="Hide post" pendingLabel="Hiding…" />
              </div>
            )}
            {post.status === "HIDDEN" && (
              <div>
                <p className="mb-2 text-sm text-ink-500">Show it on your storefront again.</p>
                <ActionButton action={setHiddenAction.bind(null, post.id, false)} label="Show post again" pendingLabel="Please wait…" />
              </div>
            )}
            <ConfirmButton
              action={deletePostAction.bind(null, post.id)}
              label="Delete post"
              question="Delete this post and its photos? This can't be undone."
              confirmLabel="Yes, delete"
            />
          </div>
        </section>
      </main>
    </div>
  );
}
