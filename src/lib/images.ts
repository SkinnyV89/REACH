import "server-only";
import sharp, { type Metadata } from "sharp";
import type { UploadTarget } from "@/lib/media-rules";

// Re-encodes every uploaded image before anything is stored. The output keeps
// only pixels: sharp writes no EXIF, XMP or IPTC unless asked to, so GPS
// location, camera details and timestamps are removed. Photos are turned
// upright first, using the orientation the camera recorded.

export class ImageError extends Error {
  constructor(
    public readonly code: "not_an_image" | "unsupported_format" | "too_small" | "too_many_pixels",
    message: string,
  ) {
    super(message);
  }
}

// Refuse anything bigger than ~40 megapixels before decoding it fully, so a
// small file that expands to a huge image can't exhaust the server's memory.
export const MAX_INPUT_PIXELS = 40_000_000;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);
const MIN_DIMENSION = { logo: 64, cover: 200, product: 200, post: 200 } as const;

type Size = { name: "lg" | "sm"; max: number; square?: boolean };
// Logos: one 256px square. Covers and item photos: a large size for the item
// page and a small one for lists and grids.
const SIZES: Record<UploadTarget, Size[]> = {
  logo: [{ name: "lg", max: 256, square: true }],
  cover: [
    { name: "lg", max: 1600 },
    { name: "sm", max: 800 },
  ],
  product: [
    { name: "lg", max: 1600 },
    { name: "sm", max: 480 },
  ],
  post: [
    { name: "lg", max: 1600 },
    { name: "sm", max: 480 },
  ],
};

export type ProcessedImage = {
  name: "lg" | "sm";
  data: Buffer;
  width: number;
  height: number;
  contentType: "image/webp";
};

export async function processImage(input: Buffer, target: UploadTarget): Promise<ProcessedImage[]> {
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch (error) {
    // sharp checks the pixel count from the header, before decoding.
    if (error instanceof Error && /pixel limit/i.test(error.message)) {
      throw new ImageError("too_many_pixels", "Image has too many pixels.");
    }
    throw new ImageError("not_an_image", "Not an image sharp can read.");
  }
  // The real format from the file's contents, not its name or claimed type.
  if (!meta.format || !ACCEPTED_FORMATS.has(meta.format)) {
    throw new ImageError("unsupported_format", `Unsupported format: ${meta.format ?? "unknown"}.`);
  }
  if (!meta.width || !meta.height) throw new ImageError("not_an_image", "Image has no dimensions.");
  if (meta.width * meta.height > MAX_INPUT_PIXELS) {
    throw new ImageError("too_many_pixels", "Image has too many pixels.");
  }
  if (Math.min(meta.width, meta.height) < MIN_DIMENSION[target]) {
    throw new ImageError("too_small", "Image is too small.");
  }

  try {
    return await Promise.all(
      SIZES[target].map(async (size) => {
        const { data, info } = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
          .rotate() // upright, from the EXIF orientation
          .resize(
            size.square
              ? { width: size.max, height: size.max, fit: "cover", position: "centre", withoutEnlargement: false }
              : { width: size.max, height: size.max, fit: "inside", withoutEnlargement: true },
          )
          .webp({ quality: size.name === "sm" ? 75 : 80, alphaQuality: 90 })
          .toBuffer({ resolveWithObject: true });
        return { name: size.name, data, width: info.width, height: info.height, contentType: "image/webp" as const };
      }),
    );
  } catch {
    // Truncated or corrupt files can pass metadata() and fail on decode.
    throw new ImageError("not_an_image", "Image could not be decoded.");
  }
}
