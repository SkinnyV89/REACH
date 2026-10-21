// A stored photo. Files are already resized and re-encoded as WebP on upload
// (small and large sizes), so a plain <img> with srcset is enough: the browser
// picks the size, and nothing is re-processed per request.

export type PhotoData = {
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  altText: string | null;
};

const SMALL_WIDTH = { product: 480, cover: 800 } as const;

export function Photo({
  photo,
  alt,
  sizes,
  kind = "product",
  priority = false,
  className = "",
}: {
  photo: PhotoData;
  alt: string; // used when the seller didn't describe the photo
  sizes: string;
  kind?: "product" | "cover" | "logo";
  priority?: boolean;
  className?: string;
}) {
  const srcSet =
    kind !== "logo" && photo.thumbUrl !== photo.url
      ? `${photo.thumbUrl} ${SMALL_WIDTH[kind]}w, ${photo.url} ${photo.width}w`
      : undefined;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- pre-sized at upload, see above
    <img
      src={photo.url}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      width={photo.width}
      height={photo.height}
      alt={photo.altText ?? alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      className={className}
    />
  );
}
