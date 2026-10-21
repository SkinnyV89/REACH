import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PhotoUpload } from "@/components/photo-upload";
import { SellerHeader } from "@/components/seller-header";
import { listProductPhotos } from "@/lib/media";
import { MAX_PRODUCT_PHOTOS } from "@/lib/media-rules";
import { getProduct, sellerCategoryOptions } from "@/lib/products";
import { requireSeller } from "@/lib/session";
import { isStorageConfigured } from "@/lib/storage";
import { setArchivedAction, updateProductAction } from "../actions";
import { ArchiveButton } from "../archive-button";
import { ProductForm } from "../product-form";
import { altTextAction, deletePhotoAction, movePhotoAction } from "./photo-actions";
import { PhotoCard } from "./photo-manager";

export const metadata: Metadata = { title: "Edit · REACH" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { session, seller } = await requireSeller();
  const { id } = await params;
  const justCreated = (await searchParams).created === "1";
  // Another seller's product looks exactly like a missing one.
  const product = UUID.test(id) ? await getProduct(seller.id, id) : null;
  if (!product) notFound();

  const [categories, photos] = await Promise.all([sellerCategoryOptions(seller.id), listProductPhotos(seller.id, product.id)]);
  const noun = product.kind === "SERVICE" ? "service" : "product";
  // Keep the current category selectable even if it was since removed from
  // the profile, so opening the form doesn't silently change it.
  const currentMissing = !categories.some((c) => c.id === product.categoryId);
  const archived = product.status === "ARCHIVED";

  return (
    <div className="min-h-screen bg-ink-100">
      <SellerHeader email={session.user.email} current="products" />
      <main className="mx-auto max-w-2xl space-y-6 px-4 py-8">
        {justCreated && (
          <p role="status" className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
            Saved. Add photos below so buyers can see what you offer.
          </p>
        )}
        <section className="rounded-2xl border border-ink-300/60 bg-white p-5 shadow-sm sm:p-8">
          <h1 className="text-2xl font-bold text-ink-900">Edit {noun}</h1>
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

        <section id="photos" aria-labelledby="photos-heading" className="scroll-mt-20 rounded-2xl border border-ink-300/60 bg-white p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="photos-heading" className="font-semibold text-ink-900">
              Photos
            </h2>
            <span className="text-sm text-ink-500">
              {photos.length} of {MAX_PRODUCT_PHOTOS}
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-500">
            The first photo is the main one, shown in your storefront. Location and camera details are removed from every
            photo before it&apos;s saved.
          </p>
          {photos.length > 0 && (
            <ul className="mt-4 grid gap-3 sm:grid-cols-3">
              {photos.map((photo, index) => (
                <PhotoCard
                  key={photo.id}
                  photo={photo}
                  index={index}
                  count={photos.length}
                  itemName={product.name}
                  remove={deletePhotoAction.bind(null, product.id, photo.id)}
                  makeMain={movePhotoAction.bind(null, product.id, photo.id, "main")}
                  earlier={movePhotoAction.bind(null, product.id, photo.id, "earlier")}
                  later={movePhotoAction.bind(null, product.id, photo.id, "later")}
                  saveAlt={altTextAction.bind(null, product.id, photo.id)}
                />
              ))}
            </ul>
          )}
          <div className="mt-4">
            {archived ? (
              <p className="text-sm text-ink-700">Restore this {noun} to add photos.</p>
            ) : photos.length >= MAX_PRODUCT_PHOTOS ? (
              <p className="text-sm text-ink-700">This {noun} has the maximum of {MAX_PRODUCT_PHOTOS} photos. Remove one to add another.</p>
            ) : (
              <PhotoUpload
                target="product"
                productId={product.id}
                remaining={MAX_PRODUCT_PHOTOS - photos.length}
                label={photos.length === 0 ? "Add photos" : "Add more photos"}
                disabledText={isStorageConfigured() ? undefined : "Photo uploads aren't set up on this server yet."}
              />
            )}
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
