import type { Metadata } from "next";
import Link from "next/link";
import { Photo } from "@/components/photo";
import { SellerHeader } from "@/components/seller-header";
import { listSellerPosts } from "@/lib/posts";
import { requireSeller } from "@/lib/session";

export const metadata: Metadata = { title: "Posts · REACH" };

const STATUS = {
  DRAFT: { label: "Not finished", className: "bg-amber-100 text-amber-900" },
  PUBLISHED: { label: "Posted", className: "bg-brand-100 text-brand-700" },
  HIDDEN: { label: "Hidden", className: "bg-ink-100 text-ink-700" },
  REMOVED: { label: "Removed", className: "bg-red-100 text-red-800" },
} as const;

export default async function PostsPage({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const { session, seller } = await requireSeller();
  const [posts, { deleted }] = await Promise.all([listSellerPosts(seller.id), searchParams]);
  const published = seller.storefrontPublishedAt !== null;

  return (
    <div className="min-h-screen bg-ink-100">
      <SellerHeader email={session.user.email} current="posts" />
      <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-ink-900 sm:text-3xl">Posts</h1>
            <p className="mt-1 text-ink-700">Show your work: photos of what you&apos;ve made or done, on your storefront.</p>
          </div>
          <Link href="/posts/new" className="rounded-lg bg-brand-600 px-4 py-2.5 font-semibold text-white hover:bg-brand-700">
            New post
          </Link>
        </div>

        {deleted && (
          <p role="status" className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
            Post deleted, with its photos.
          </p>
        )}
        {!published && posts.length > 0 && (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Your storefront isn&apos;t published, so customers can&apos;t see your posts yet.{" "}
            <Link href="/storefront" className="font-semibold underline">
              Publish your storefront
            </Link>
          </p>
        )}

        {posts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ink-300 bg-white px-6 py-12 text-center">
            <h2 className="text-lg font-semibold text-ink-900">No posts yet</h2>
            <p className="mx-auto mt-2 max-w-md text-ink-700">
              Post photos of real work, like a finished hairstyle or a cake you baked, so buyers can see what you do.
            </p>
            <Link href="/posts/new" className="mt-6 inline-block rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white hover:bg-brand-700">
              Make your first post
            </Link>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {posts.map((p) => (
              <li key={p.id}>
                <Link href={`/posts/${p.id}`} className="block overflow-hidden rounded-xl border border-ink-300/60 bg-white hover:border-brand-500">
                  <span className="relative block aspect-square bg-ink-100">
                    {p.photo ? (
                      <Photo photo={p.photo} alt="" sizes="(min-width: 640px) 280px, 50vw" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full items-center justify-center px-3 text-center text-xs text-ink-500">No photos yet</span>
                    )}
                    <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[p.status].className}`}>
                      {STATUS[p.status].label}
                    </span>
                  </span>
                  <span className="block p-3">
                    <span className="line-clamp-2 text-sm text-ink-900">{p.caption || <span className="text-ink-500">No caption</span>}</span>
                    <span className="mt-1 block text-xs text-ink-500">
                      {p.photoCount} {p.photoCount === 1 ? "photo" : "photos"}
                      {p.tagCount > 0 && ` · ${p.tagCount} tagged`}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
