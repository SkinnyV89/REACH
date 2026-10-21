"use server";

import { headers } from "next/headers";
import type { LeadFormState } from "@/app/c/[link]/actions";
import { fieldErrors } from "@/lib/auth-rules";
import { HONEYPOT_FIELD, leadFormSchema, parseChannel } from "@/lib/lead-rules";
import { hashIp } from "@/lib/public-campaigns";
import { submitStorefrontLead } from "@/lib/public-storefronts";
import { parseCampaignCode } from "@/lib/storefront-rules";

function clientIp(h: Headers): string {
  // On Vercel the first x-forwarded-for entry is the client.
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

// The storefront, item (or post), src and c are bound on the server page from the URL.
// They still come from the visitor, so submitStorefrontLead re-resolves the
// seller and item and only accepts a published storefront.
export async function submitStorefrontLeadAction(
  sellerSlug: string,
  itemSlug: string | null,
  src: string | null,
  campaignCode: string | null,
  postCode: string | null,
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
    const result = await submitStorefrontLead(
      sellerSlug,
      itemSlug,
      parsed.data,
      { ...parseChannel(src), campaignCode: parseCampaignCode(campaignCode) },
      hashIp(clientIp(await headers())),
      postCode,
    );
    if (result.ok) return { sent: true };
    if (result.reason === "rate_limited") {
      return { formError: "Too many enquiries from this connection. Please wait a few minutes and try again.", values };
    }
    return { formError: "This storefront isn't taking enquiries right now.", values };
  } catch (error) {
    console.error("[storefront] enquiry failed:", error instanceof Error ? error.name : typeof error);
    return { formError: "We couldn't send your enquiry. Please try again.", values };
  }
}
