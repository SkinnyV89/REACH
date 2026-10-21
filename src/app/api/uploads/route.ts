import { NextResponse } from "next/server";
import { z } from "zod";
import { MediaError, uploadImage } from "@/lib/media";
import { MAX_UPLOAD_BYTES, altTextSchema, type UploadErrorCode } from "@/lib/media-rules";
import { getCurrentSeller, getSession } from "@/lib/session";

// One photo per request, so each stays under Vercel's 4.5 MB body limit. The
// browser shrinks photos before sending them; this route checks everything
// again and re-encodes the image (see src/lib/images.ts) before storing it.
export const runtime = "nodejs";

const fieldsSchema = z.object({
  target: z.enum(["logo", "cover", "product"]),
  productId: z.uuid().nullable(),
  altText: altTextSchema.nullable(),
  peopleConsent: z.literal("on").nullable(),
});

const STATUS: Partial<Record<UploadErrorCode, number>> = {
  not_signed_in: 401,
  not_found: 404,
  too_large: 413,
  rate_limited: 429,
  storage_not_configured: 503,
  failed: 500,
};

function fail(code: UploadErrorCode) {
  return NextResponse.json({ ok: false, error: code }, { status: STATUS[code] ?? 400 });
}

export async function POST(request: Request) {
  // Only from REACH's own pages.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return fail("bad_request");

  const session = await getSession();
  const seller = await getCurrentSeller();
  if (!session || !seller || seller.status !== "ACTIVE") return fail("not_signed_in");

  // Reject oversized bodies before reading them.
  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_UPLOAD_BYTES + 64 * 1024) return fail("too_large");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("bad_request");
  }
  const file = form.get("file");
  const fields = fieldsSchema.safeParse({
    target: form.get("target"),
    productId: form.get("productId") || null,
    altText: form.get("altText") ?? null,
    peopleConsent: form.get("peopleConsent") ?? null,
  });
  if (!(file instanceof File) || !fields.success) return fail("bad_request");
  if (file.size > MAX_UPLOAD_BYTES) return fail("too_large");
  if (file.size === 0) return fail("not_an_image");

  try {
    const media = await uploadImage({
      userId: session.user.id,
      sellerId: seller.id, // from the session, never from the request
      target: fields.data.target,
      productId: fields.data.target === "product" ? fields.data.productId : null,
      data: Buffer.from(await file.arrayBuffer()),
      altText: fields.data.altText,
      peopleConsent: fields.data.peopleConsent === "on",
    });
    return NextResponse.json({ ok: true, media: { id: media.id, url: media.url, thumbUrl: media.thumbUrl } });
  } catch (error) {
    if (error instanceof MediaError) return fail(error.code);
    // Log the failure type only; never the file or form contents.
    console.error("[uploads] failed:", error instanceof Error ? error.name : typeof error);
    return fail("failed");
  }
}
