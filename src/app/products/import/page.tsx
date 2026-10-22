import type { Metadata } from "next";
import Link from "next/link";
import { SellerHeader } from "@/components/seller-header";
import { isAIConfigured } from "@/lib/ai";
import { MAX_PRODUCTS_PER_SELLER } from "@/lib/product-rules";
import { countProducts, sellerCategoryOptions } from "@/lib/products";
import { requireSeller } from "@/lib/session";
import { importItemsAction } from "../actions";
import { MenuImport } from "./menu-import";

export const metadata: Metadata = { title: "Add from a flyer · REACH" };

export default async function ImportPage() {
  const { session, seller } = await requireSeller();
  const [categories, counts] = await Promise.all([sellerCategoryOptions(seller.id), countProducts(seller.id)]);
  const room = MAX_PRODUCTS_PER_SELLER - counts.active - counts.archived;

  return (
    <div className="min-h-screen bg-ink-100">
      <SellerHeader email={session.user.email} current="products" />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-8">
        <Link href="/products" className="text-sm font-semibold text-brand-700 hover:underline">
          ← Products &amp; services
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Add from a flyer</h1>
          <p className="mt-1 text-sm text-ink-700">
            Choose a photo of your flyer, menu or price list. REACH reads the items and prices for you to check. Nothing is added until you save, and the photo
            isn&apos;t kept.
          </p>
        </div>
        {!isAIConfigured() ? (
          <p className="rounded-xl bg-white p-5 text-ink-700">
            Reading flyers needs REACH&apos;s AI service, which isn&apos;t switched on yet.{" "}
            <Link href="/products/new" className="font-semibold text-brand-700 hover:underline">
              Add your items by hand
            </Link>{" "}
            for now.
          </p>
        ) : categories.length === 0 ? (
          <p className="rounded-xl bg-white p-5 text-ink-700">
            Add a business category to your{" "}
            <Link href="/onboarding?step=2" className="font-semibold text-brand-700 hover:underline">
              business profile
            </Link>{" "}
            first, so your items can be filed under it.
          </p>
        ) : room <= 0 ? (
          <p className="rounded-xl bg-white p-5 text-ink-700">
            You&apos;ve reached {MAX_PRODUCTS_PER_SELLER} items. Edit or remove old ones before adding more.
          </p>
        ) : (
          <MenuImport action={importItemsAction} categories={categories} room={room} />
        )}
      </main>
    </div>
  );
}
