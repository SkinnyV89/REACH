import type { Metadata } from "next";
import { SellerHeader } from "@/components/seller-header";
import { sellerCategoryOptions } from "@/lib/products";
import { requireSeller } from "@/lib/session";
import { createProductAction } from "../actions";
import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "Add a product or service · REACH" };

export default async function NewProductPage() {
  const { session, seller } = await requireSeller();
  const categories = await sellerCategoryOptions(seller.id);

  return (
    <div className="min-h-screen bg-ink-100">
      <SellerHeader email={session.user.email} current="products" />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <section className="rounded-2xl border border-ink-300/60 bg-white p-5 shadow-sm sm:p-8">
          <h1 className="text-2xl font-bold text-ink-900">Add a product or service</h1>
          <p className="mt-1 text-sm text-ink-500">You can change any of this later.</p>
          <div className="mt-6">
            <ProductForm
              action={createProductAction}
              categories={categories}
              submitLabel="Save"
              initial={{
                kind: "PRODUCT",
                name: "",
                categoryId: categories.length === 1 ? categories[0].id : "",
                description: "",
                priceType: "FIXED",
                price: "",
                status: "AVAILABLE",
              }}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
