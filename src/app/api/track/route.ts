import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { parseChannel } from "@/lib/lead-rules";
import { recordEvent } from "@/lib/public-campaigns";

// Anonymous engagement beacon for public campaign pages. Identifies a
// browser with a random first-party cookie only; no personal data.
export const VISITOR_COOKIE = "reach_vid";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // 180 days

const bodySchema = z.object({
  link: z.string().max(120),
  type: z.enum(["VIEW", "WHATSAPP_CLICK"]),
  src: z.string().max(40).nullable().optional(),
});

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
  let visitor = jar.get(VISITOR_COOKIE)?.value;
  const fresh = !visitor || !/^[0-9a-f-]{36}$/.test(visitor);
  if (fresh) visitor = randomUUID();

  try {
    await recordEvent(body.link, visitor!, body.type, parseChannel(body.src).channel);
  } catch (error) {
    console.error("[track] failed:", error instanceof Error ? error.name : typeof error);
  }

  const response = new NextResponse(null, { status: 204 });
  if (fresh) {
    response.cookies.set(VISITOR_COOKIE, visitor!, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });
  }
  return response;
}
