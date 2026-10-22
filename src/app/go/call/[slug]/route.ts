import { NextResponse } from "next/server";
import { getCallTarget } from "@/lib/public-storefronts";

// "Call" on a storefront goes through here, so the number is never written
// into a public page (storefronts are indexed by search engines). The phone
// opens its dialler; nothing is called automatically.
const noindex = { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" };

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const target = await getCallTarget(slug);
  if (!target) return new NextResponse("Not found", { status: 404, headers: noindex });
  return new NextResponse(null, { status: 302, headers: { ...noindex, Location: `tel:${target.callNumber}` } });
}
