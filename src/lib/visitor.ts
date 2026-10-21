import "server-only";
import { randomUUID } from "node:crypto";

// Anonymous visitor id for engagement counts: a random first-party cookie,
// no personal data. Shared by /api/track and /go/wa.
export const VISITOR_COOKIE = "reach_vid";
export const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // 180 days
const VISITOR_RE = /^[0-9a-f-]{36}$/;

export function readVisitor(value: string | undefined): string | null {
  return value && VISITOR_RE.test(value) ? value : null;
}

export function newVisitor(): string {
  return randomUUID();
}

export const visitorCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: VISITOR_COOKIE_MAX_AGE,
};
