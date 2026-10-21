import type { Metadata } from "next";
import Link from "next/link";
import { Photo } from "@/components/photo";
import { SellerHeader } from "@/components/seller-header";
import { PRODUCT_STATUSES, formatPrice } from "@/lib/product-rules";
import { AVAILABILITY, availabilityLabel } from "@/lib/storefront-rules";
import { countProducts, listProducts } from "@/lib/products";
import { requireSeller } from "@/lib/session";

export const metadata: Metadata = { title: "Products & services · REACH" };

const SAVED_MESSAGES: Record<string, string> = {
  created: "Saved. It's now ready to feature in your campaigns.",
  updated: "Changes saved.",
  archived: "Archived. It's hidden from your list and won't be used in new campaigns.",
  restored: "Restored and marked as available.",
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; view?: string }>;
}) {
  const { session, seller } = await requireSeller();
  const { saved, view } = await searchParams;
  const showArchived = view === "archived";
  const [products, counts] = await Promise.all([
    listProducts(seller.id, { archived: showArchived }),
    countProducts(seller.id),
  ]);
  const message = saved ? SAVED_MESSAGES[saved] : undefined;

  return (
    <div className="min-h-screen bg-ink-100">
      <SellerHeader email={session.user.email} current="products" />
      <main className="mx-auto max-w-4xl px-4 py-8">
        {message && (
          <div role="status" className="mb-6 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
            {message}
          </div>
        )}

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-ink-900 sm:text-3xl">Products & services</h1>
            <p className="mt-1 text-ink-700">What you want new customers to discover.</p>
          </div>
          {!showArchived && (counts.active > 0 || counts.archived > 0) && (
            <Link
              href="/products/new"
              className="rounded-lg bg-brand-600 px-4 py-2.5 font-semibold text-white transition hover:bg-brand-700"
            >
              Add new
            </Link>
          )}
        </div>

        {(counts.archived > 0 || showArchived) && (
          <div className="mt-6 flex gap-2 text-sm" role="tablist">
            <Link
              href="/products"
              role="tab"
              aria-selected={!showArchived}
              className={`rounded-full px-3 py-1 font-medium ${!showArchived ? "bg-ink-900 text-white" : "bg-white text-ink-700"}`}
            >
              Current ({counts.active})
            </Link>
            <Link
              href="/products?view=archived"
              role="tab"
              aria-selected={showArchived}
              className={`rounded-full px-3 py-1 font-medium ${showArchived ? "bg-ink-900 text-white" : "bg-white text-ink-700"}`}
            >
              Archived ({counts.archived})
            </Link>
          </div>
        )}

        {products.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-ink-300 bg-white px-6 py-12 text-center">
            {showArchived ? (
              <p className="text-ink-700">Nothing archived.</p>
            ) : (
              <>
                <h2 className="text-lg font-semibold text-ink-900">Add your first product or service</h2>
                <p className="mx-auto mt-2 max-w-md text-ink-700">
                  It only takes a minute: a name, a category and a price. Your campaigns will use these details,
                  so customers see exactly what you offer.
                </p>
                <Link
                  href="/products/new"
                  className="mt-6 inline-block rounded-lg bg-brand-600 px-5 py-3 font-semibold text-white transition hover:bg-brand-700"
                >
                  Add a product or service
                </Link>
              </>
            )}
          </div>
        ) : (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {products.map((p) => {
              const status =
                p.status === "ARCHIVED"
                  ? PRODUCT_STATUSES.ARCHIVED
                  : { label: availabilityLabel(p.availability, p.kind), className: AVAILABILITY[p.availability].className };
              return (
                <li key={p.id}>
                  <Link
                    href={`/products/${p.id}`}
                    className="flex h-full gap-3 rounded-xl border border-ink-300/60 bg-white p-4 transition hover:border-brand-500 hover:shadow-sm"
                  >
                    {p.photo ? (
                      <Photo photo={p.photo} alt="" sizes="64px" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-center text-[10px] leading-tight text-ink-500">
                        No photo
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 font-semibold text-ink-900">{p.name}</p>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}>
                          {status.label}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-ink-500">
                        {p.kind === "SERVICE" ? "Service" : "Product"} · {p.category.name}
                      </p>
                      <p className="mt-2 font-medium text-ink-900">{formatPrice(p.priceType, p.price)}</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
