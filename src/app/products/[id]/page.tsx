import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SellerHeader } from "@/components/seller-header";
import { getProduct, sellerCategoryOptions } from "@/lib/products";
import { requireSeller } from "@/lib/session";
import { setArchivedAction, updateProductAction } from "../actions";
import { ArchiveButton } from "../archive-button";
import { ProductForm } from "../product-form";

export const metadata: Metadata = { title: "Edit · REACH" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { session, seller } = await requireSeller();
  const { id } = await params;
  // Another seller's product looks exactly like a missing one.
  const product = UUID.test(id) ? await getProduct(seller.id, id) : null;
  if (!product) notFound();

  const categories = await sellerCategoryOptions(seller.id);
  // Keep the current category selectable even if it was since removed from
  // the profile, so opening the form doesn't silently change it.
  const currentMissing = !categories.some((c) => c.id === product.categoryId);
  const archived = product.status === "ARCHIVED";

  return (
    <div className="min-h-screen bg-ink-100">
      <SellerHeader email={session.user.email} current="products" />
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        <section className="rounded-2xl border border-ink-300/60 bg-white p-5 shadow-sm sm:p-8">
          <h1 className="text-2xl font-bold text-ink-900">Edit {product.kind === "SERVICE" ? "service" : "product"}</h1>
          {archived && (
            <p className="mt-2 rounded-lg bg-ink-100 px-3 py-2 text-sm text-ink-700">
              This is archived. Restore it to use it in campaigns again.
            </p>
          )}
          {currentMissing && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Its category is no longer on your business profile. Choose one of your current categories to save changes.
            </p>
          )}
          <div className="mt-6">
            <ProductForm
              action={updateProductAction.bind(null, product.id)}
              categories={categories}
              submitLabel="Save changes"
              initial={{
                kind: product.kind,
                name: product.name,
                categoryId: currentMissing ? "" : product.categoryId,
                description: product.description ?? "",
                priceType: product.priceType,
                price: product.price?.replace(/\.00$/, "") ?? "",
                availability: product.availability,
                leadTimeDays: product.leadTimeDays ? String(product.leadTimeDays) : "",
              }}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-ink-300/60 bg-white p-5 sm:p-6">
          <h2 className="font-semibold text-ink-900">{archived ? "Restore" : "Archive"}</h2>
          <p className="mt-1 text-sm text-ink-500">
            {archived
              ? "Bring this back to your list as available."
              : "Hide this from your list and from new campaigns. Nothing is deleted, and you can restore it any time."}
          </p>
          <div className="mt-4">
            <ArchiveButton action={setArchivedAction.bind(null, product.id, !archived)} archived={archived} />
          </div>
        </section>
      </main>
    </div>
  );
}
