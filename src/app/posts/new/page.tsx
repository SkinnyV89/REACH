import type { Metadata } from "next";
import { SellerHeader } from "@/components/seller-header";
import { taggableProducts } from "@/lib/posts";
import { requireSeller } from "@/lib/session";
import { isStorageConfigured } from "@/lib/storage";
import { PostComposer } from "./composer";

export const metadata: Metadata = { title: "New post · REACH" };

export default async function NewPostPage() {
  const { session, seller } = await requireSeller();
  const products = await taggableProducts(seller.id);

  return (
    <div className="min-h-screen bg-ink-100">
      <SellerHeader email={session.user.email} current="posts" />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <section className="rounded-2xl border border-ink-300/60 bg-white p-5 shadow-sm sm:p-8">
          <h1 className="text-2xl font-bold text-ink-900">New post</h1>
          <p className="mt-1 text-sm text-ink-500">Photos of your real work, shown on your storefront. Up to 6 photos.</p>
          <div className="mt-6">
            {isStorageConfigured() ? (
              <PostComposer products={products} />
            ) : (
              <p className="rounded-lg bg-ink-100 px-3 py-2 text-sm text-ink-700">Photo uploads aren&apos;t set up on this server yet, so posts can&apos;t be made.</p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
