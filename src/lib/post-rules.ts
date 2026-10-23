import { z } from "zod";
import { CODE_ALPHABET } from "@/lib/campaign-rules";

// Proof Post rules shared by the browser and the server. Pure: no database or
// storage access.

export const MAX_POST_PHOTOS = 6;
export const MAX_POST_TAGS = 5;
export const CAPTION_MAX = 1000;
export const POSTS_ON_STOREFRONT = 9;
export const POSTS_PER_PAGE = 24;

// "1 000": thousands grouped with a plain space. Not toLocaleString, whose
// output differs between Node and browsers (and breaks hydration).
export function groupThousands(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export const POST_CODE_LENGTH = 10;
export const POST_CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${POST_CODE_LENGTH}}$`);

// ---------------------------------------------------------------------------
// Captions: the seller's own words, without contact details. Buyers reach
// sellers through the WhatsApp button and enquiry form, which keeps numbers
// out of public pages and keeps enquiries attributed.
// ---------------------------------------------------------------------------

const LINK_RE =
  /(https?:\/\/|www\.|\bwa\.me\b|\b[a-z0-9-]+\.(?:com|co\.za|org\.za|net|org|za|io|me|ly|link|app|shop|store|info|biz|online|site|page|to)\b)/i;
// Nine or more digits, optionally separated by spaces, dashes, dots or
// brackets: "082 123 4567", "+27 (82) 123-4567", "0821234567". Prices and
// dates have fewer digits or use other separators.
const PHONE_RE = /(?:\+?\d[\s\-.()]*){9,}/;
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;

export const CONTACT_IN_CAPTION_MESSAGE =
  "Buyers contact you with the WhatsApp button, so leave out phone numbers, emails and links.";

export function captionContactProblem(caption: string): "link" | "phone" | "email" | null {
  if (EMAIL_RE.test(caption)) return "email";
  if (LINK_RE.test(caption)) return "link";
  if (PHONE_RE.test(caption)) return "phone";
  return null;
}

export const captionSchema = z
  .string()
  .trim()
  .max(CAPTION_MAX, `Keep the caption under ${groupThousands(CAPTION_MAX)} characters.`)
  .refine((c) => captionContactProblem(c) === null, CONTACT_IN_CAPTION_MESSAGE);

const UUID = z.uuid({ message: "Choose items from your list." });

export const postInputSchema = z.object({
  caption: captionSchema,
  productIds: z
    .array(UUID)
    .max(MAX_POST_TAGS, `Tag up to ${MAX_POST_TAGS} items.`)
    .transform((ids) => [...new Set(ids)]),
});

export type PostInput = z.infer<typeof postInputSchema>;

export function postInputFromForm(form: FormData) {
  return { caption: String(form.get("caption") ?? ""), productIds: form.getAll("productIds").map(String) };
}

// ---------------------------------------------------------------------------
// Capture labels. They describe how a photo reached REACH, not whether it is
// "real". IN_APP_CAMERA is only ever set by REACH's own camera (not built yet).
// ---------------------------------------------------------------------------

export type CaptureSourceValue = "GALLERY" | "IN_APP_CAMERA";

const captureTime = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Africa/Johannesburg",
});

export function captureLabel(source: CaptureSourceValue, capturedAt: Date | null): string {
  if (source === "IN_APP_CAMERA") return capturedAt ? `Photo taken in REACH · ${captureTime.format(capturedAt)}` : "Photo taken in REACH";
  return "From gallery";
}

export const CAPTURE_EXPLAINER = {
  IN_APP_CAMERA: "Taken in REACH: photographed with REACH's camera at the time shown.",
  GALLERY: "From gallery: chosen from the seller's phone or computer. REACH can't tell when it was taken.",
} as const;

const postedDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Johannesburg" });

export function formatPostedDate(date: Date): string {
  return `Posted ${postedDate.format(date)}`;
}
