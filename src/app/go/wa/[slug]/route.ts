import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { parseChannel, whatsappLink } from "@/lib/lead-rules";
import { getWhatsappTarget, recordStorefrontEvent } from "@/lib/public-storefronts";
import { getCurrentSeller } from "@/lib/session";
import { parseCampaignCode } from "@/lib/storefront-rules";
import { VISITOR_COOKIE, readVisitor } from "@/lib/visitor";

// Storefront "Chat on WhatsApp" goes through here so the seller's number is
// never in a public page's HTML (storefronts are indexed by search engines).
// Opens WhatsApp with a greeting typed in; it doesn't send anything.
const noindex = { "X-Robots-Tag": "noindex, nofollow", "Cache-Control": "no-store" };

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const url = new URL(request.url);
  const item = url.searchParams.get("item");
  const target = await getWhatsappTarget(slug, item);
  if (!target) return new NextResponse("Not found", { status: 404, headers: noindex });

  // Count the tap only for a browser that loaded the storefront (it has the
  // visitor cookie, set by the page's view beacon), and never the owner's own.
  // Bots and link previews that fetch this URL directly aren't counted.
  const visitor = readVisitor((await cookies()).get(VISITOR_COOKIE)?.value);
  const viewer = await getCurrentSeller();
  if (visitor && viewer?.id !== target.sellerId) {
    try {
      await recordStorefrontEvent({
        sellerSlug: slug,
        itemSlug: item,
        sessionId: visitor,
        type: "WHATSAPP_CLICK",
        channel: parseChannel(url.searchParams.get("src")).channel,
        campaignCode: parseCampaignCode(url.searchParams.get("c")),
      });
    } catch (error) {
      console.error("[go/wa] tracking failed:", error instanceof Error ? error.name : typeof error);
    }
  }

  const greeting = target.itemName
    ? `Hi ${target.businessName}, I saw "${target.itemName}" on your REACH storefront and I'd like to know more.`
    : `Hi ${target.businessName}, I found you on REACH and I'd like to know more.`;
  return NextResponse.redirect(whatsappLink(target.whatsappNumber, greeting), { status: 302, headers: noindex });
}
