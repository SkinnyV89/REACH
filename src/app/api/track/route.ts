import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseChannel } from "@/lib/lead-rules";
import { recordEvent } from "@/lib/public-campaigns";
import { recordStorefrontEvent } from "@/lib/public-storefronts";
import { parseCampaignCode } from "@/lib/storefront-rules";
import { VISITOR_COOKIE, newVisitor, readVisitor, visitorCookieOptions } from "@/lib/visitor";

// Anonymous engagement beacon for public campaign pages and storefronts.
// Identifies a browser with a random first-party cookie only; no personal data.
const campaignBody = z.object({
  link: z.string().max(120),
  type: z.enum(["VIEW", "WHATSAPP_CLICK"]),
  src: z.string().max(40).nullable().optional(),
});
// Storefront WhatsApp taps are counted server-side by /go/wa, so only views here.
const storefrontBody = z.object({
  storefront: z.string().max(60),
  item: z.string().max(70).nullable().optional(),
  post: z.string().max(20).nullable().optional(),
  type: z.literal("VIEW"),
  src: z.string().max(40).nullable().optional(),
  c: z.string().max(20).nullable().optional(),
});
const bodySchema = z.union([campaignBody, storefrontBody]);

export async function POST(request: Request) {
  // Only accept beacons from our own pages.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return new NextResponse(null, { status: 403 });
  }

  let body;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const jar = await cookies();
  const existing = readVisitor(jar.get(VISITOR_COOKIE)?.value);
  const visitor = existing ?? newVisitor();

  try {
    if ("link" in body) {
      await recordEvent(body.link, visitor, body.type, parseChannel(body.src).channel);
    } else {
      await recordStorefrontEvent({
        sellerSlug: body.storefront,
        itemSlug: body.item ?? null,
        postCode: body.post ?? null,
        sessionId: visitor,
        type: "VIEW",
        channel: parseChannel(body.src).channel,
        campaignCode: parseCampaignCode(body.c),
      });
    }
  } catch (error) {
    console.error("[track] failed:", error instanceof Error ? error.name : typeof error);
  }

  const response = new NextResponse(null, { status: 204 });
  if (!existing) response.cookies.set(VISITOR_COOKIE, visitor, visitorCookieOptions);
  return response;
}
