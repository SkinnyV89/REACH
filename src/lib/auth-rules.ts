import { z } from "zod";

// Shared between the server auth config and the client forms so the rules
// shown to the user are the rules the server enforces.
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export const signUpSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(100, "Name is too long."),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
    .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters.`),
});

export type FieldErrors = Partial<Record<string, string>>;

export function fieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

// Maps Better Auth error responses to plain-language messages. Sign-in
// failures stay generic so the form does not reveal which emails exist.
export function authErrorMessage(error: { status?: number; code?: string; message?: string }): string {
  if (error.status === 429) return "Too many attempts. Please wait a minute and try again.";
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return "Incorrect email or password.";
    case "USER_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL":
      return "An account with this email already exists. Try signing in instead.";
    case "PASSWORD_TOO_SHORT":
      return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
    case "PASSWORD_TOO_LONG":
      return `Use at most ${PASSWORD_MAX_LENGTH} characters.`;
    case "INVALID_EMAIL":
      return "Enter a valid email address.";
    default:
      return "Something went wrong. Please try again.";
  }
}

// Where to go after signing in or up, from a ?next= parameter. Only paths on
// this site are allowed ("/s/thandi"), never another site ("//evil.example",
// "https://…", "/\\evil"), so the parameter can't be used to send people away.
export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 300) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  if (/[\s\\]/.test(raw) || raw.includes("://")) return null;
  // Auth pages themselves would loop.
  if (/^\/(sign-in|sign-up)(\/|\?|$)/.test(raw)) return null;
  return raw;
}
