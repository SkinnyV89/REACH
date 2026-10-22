import { NextResponse } from "next/server";
import { MenuImportError, readMenuFromImage } from "@/lib/menu-import";
import { MAX_UPLOAD_BYTES } from "@/lib/media-rules";
import { getCurrentSeller, getSession } from "@/lib/session";

// Reads one flyer photo and returns draft items for the seller to review.
// A route rather than a server action because server actions cap request
// bodies at 1 MB and a phone photo is bigger. Nothing is stored.
export const runtime = "nodejs";
export const maxDuration = 120;

function fail(error: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error, message }, { status });
}

const STATUS: Record<MenuImportError["code"], number> = {
  not_configured: 503,
  rate_limited: 429,
  not_an_image: 400,
  unsupported_format: 400,
  failed: 502,
};

export async function POST(request: Request) {
  // Only from REACH's own pages.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return fail("bad_request", "Something went wrong.", 400);

  const session = await getSession();
  const seller = await getCurrentSeller();
  if (!session || !seller || seller.status !== "ACTIVE") return fail("not_signed_in", "Sign in again to continue.", 401);

  const length = Number(request.headers.get("content-length") ?? 0);
  if (length > MAX_UPLOAD_BYTES + 64 * 1024) return fail("too_large", "That photo is too big.", 413);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("bad_request", "Something went wrong.", 400);
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("bad_request", "Choose a photo of your flyer.", 400);
  if (file.size > MAX_UPLOAD_BYTES) return fail("too_large", "That photo is too big.", 413);

  try {
    const draft = await readMenuFromImage(session.user.id, seller.id, Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ ok: true, draft });
  } catch (error) {
    if (error instanceof MenuImportError) return fail(error.code, error.message, STATUS[error.code]);
    // Log the failure type only; never the image or its text.
    console.error("[menu-import] failed:", error instanceof Error ? error.name : typeof error);
    return fail("failed", "We couldn't read that photo just now. Try again in a minute.", 500);
  }
}
