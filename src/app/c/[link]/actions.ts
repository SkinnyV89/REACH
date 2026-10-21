"use server";

import { headers } from "next/headers";
import { fieldErrors, type FieldErrors } from "@/lib/auth-rules";
import { HONEYPOT_FIELD, leadFormSchema, parseChannel } from "@/lib/lead-rules";
import { hashIp, submitLead } from "@/lib/public-campaigns";

export type LeadFormState = {
  sent?: boolean;
  errors?: FieldErrors;
  formError?: string;
  values?: Record<string, string>;
};

function clientIp(h: Headers): string {
  // On Vercel the first x-forwarded-for entry is the client.
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

// link and src are bound on the server page from the URL. They still come
// from the visitor, so submitLead re-resolves the campaign and its seller.
export async function submitLeadAction(
  link: string,
  src: string | null,
  _prev: LeadFormState,
  form: FormData,
): Promise<LeadFormState> {
  const values = {
    name: String(form.get("name") ?? ""),
    contact: String(form.get("contact") ?? ""),
    message: String(form.get("message") ?? ""),
  };
  // Bots that fill the hidden field are told it worked; nothing is saved.
  if (String(form.get(HONEYPOT_FIELD) ?? "") !== "") return { sent: true };

  const parsed = leadFormSchema.safeParse({ ...values, consent: form.get("consent") ?? undefined });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  try {
    const result = await submitLead(link, parsed.data, parseChannel(src), hashIp(clientIp(await headers())));
    if (result.ok) return { sent: true };
    if (result.reason === "rate_limited") {
      return { formError: "Too many enquiries from this connection. Please wait a few minutes and try again.", values };
    }
    return { formError: "This campaign isn't taking enquiries right now.", values };
  } catch (error) {
    console.error("[leads] submit failed:", error instanceof Error ? error.name : typeof error);
    return { formError: "We couldn't send your enquiry. Please try again.", values };
  }
}
