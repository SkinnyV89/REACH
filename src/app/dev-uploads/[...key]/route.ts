import { NextResponse } from "next/server";
import { readLocalUpload, storageDriver } from "@/lib/storage";

// Serves photos saved by the local-disk storage backend (development and
// automated tests only). With Vercel Blob, photos are served by Blob and this
// route always returns 404.
export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  if (storageDriver() !== "local") return new NextResponse(null, { status: 404 });
  const { key } = await params;
  const data = await readLocalUpload(key.join("/"));
  if (!data) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
