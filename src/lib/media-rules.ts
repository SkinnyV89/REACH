import { z } from "zod";

// Photo rules shared by the browser (before upload) and the server. Pure: no
// database or storage access.

// Vercel rejects request bodies over 4.5 MB. Files are kept to 4 MB so the
// form fields and multipart overhead always fit.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MAX_PRODUCT_PHOTOS = 6;
// Photos are shrunk in the browser to fit inside this before upload.
export const CLIENT_MAX_DIMENSION = 2048;
export const LOGO_CLIENT_MAX_DIMENSION = 1024;
// Uploads per seller per hour, to keep storage costs bounded.
export const UPLOADS_PER_HOUR = 60;

// What the file picker offers. HEIC (iPhone) is listed so phones offer those
// photos; the browser converts them before upload where it can read them.
export const ACCEPT_ATTRIBUTE = "image/jpeg,image/png,image/webp,image/heic,image/heif";

export type UploadTarget = "logo" | "cover" | "product" | "post";
export const MEDIA_KIND_FOR_TARGET = { logo: "LOGO", cover: "COVER", product: "PRODUCT", post: "POST" } as const;

// Photos that may show people need the seller's confirmation that they have
// permission (POPIA: a recognisable face is personal information).
export function needsPeopleConsent(target: UploadTarget): boolean {
  return target !== "logo";
}

// Scales (width, height) down to fit inside a max x max box, keeping the
// aspect ratio. Never enlarges.
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export const altTextSchema = z
  .string()
  .trim()
  .max(200, "Keep the description under 200 characters.")
  .transform((v) => (v === "" ? null : v));

export type UploadErrorCode =
  | "not_signed_in"
  | "bad_request"
  | "too_large"
  | "not_an_image"
  | "unsupported_format"
  | "too_small"
  | "too_many_pixels"
  | "limit_reached"
  | "consent_required"
  | "not_found"
  | "post_not_draft"
  | "rate_limited"
  | "storage_not_configured"
  | "failed";

const MB = (MAX_UPLOAD_BYTES / 1024 / 1024).toFixed(0);

export const UPLOAD_ERROR_MESSAGES: Record<UploadErrorCode, string> = {
  not_signed_in: "Your session has ended. Sign in again to upload photos.",
  bad_request: "That upload didn't work. Please try again.",
  too_large: `That photo is too big. Photos must be under ${MB} MB.`,
  not_an_image: "That file isn't a photo REACH can read.",
  unsupported_format: "Use a JPEG, PNG or WebP photo.",
  too_small: "That photo is too small. Use a bigger one.",
  too_many_pixels: "That photo is too large to process. Use a smaller one.",
  limit_reached: `That's the most photos allowed (${MAX_PRODUCT_PHOTOS}). Remove one to add another.`,
  consent_required: "Confirm you have permission from anyone shown in the photo.",
  not_found: "That item or post could not be found.",
  post_not_draft: "Photos can only be added before a post is published.",
  rate_limited: "You've uploaded a lot of photos in the last hour. Please try again later.",
  storage_not_configured: "Photo uploads aren't set up on this server yet.",
  failed: "We couldn't save that photo. Please try again.",
};

export function uploadErrorMessage(code: string | undefined): string {
  return UPLOAD_ERROR_MESSAGES[(code ?? "failed") as UploadErrorCode] ?? UPLOAD_ERROR_MESSAGES.failed;
}
