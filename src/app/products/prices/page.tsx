import type { Metadata } from "next";
import Link from "next/link";
import { SellerHeader } from "@/components/seller-header";
import { listProducts } from "@/lib/products";
import { requireSeller } from "@/lib/session";
import { bulkUpdateAction } from "../actions";
import { PriceEditor } from "./price-editor";

export const metadata: Metadata = { title: "Edit prices · REACH" };

export default async function EditPricesPage() {
  const { session, seller } = await requireSeller();
  const items = await listProducts(seller.id);

  return (
    <div className="min-h-screen bg-ink-100">
      <SellerHeader email={session.user.email} current="products" />
      <main className="mx-auto max-w-2xl space-y-4 px-4 py-8">
        <Link href="/products" className="text-sm font-semibold text-brand-700 hover:underline">
          ← Products &amp; services
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Edit prices</h1>
          <p className="mt-1 text-sm text-ink-700">Change today&apos;s prices and what&apos;s available, then save once.</p>
        </div>
        {items.length === 0 ? (
          <p className="rounded-xl bg-white p-5 text-center text-ink-700">You haven&apos;t listed anything yet.</p>
        ) : (
          <PriceEditor
            action={bulkUpdateAction}
            items={items.map((p) => ({
              id: p.id,
              name: p.name,
              kind: p.kind,
              priceType: p.priceType,
              price: p.price ? p.price.replace(/\.00$/, "") : "",
              availability: p.availability,
            }))}
          />
        )}
      </main>
    </div>
  );
}
