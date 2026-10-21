import { z } from "zod";

// Rules for public enquiries and lead management. Pure functions, shared by
// the public form and the server; the server is the enforcement point.

export const LEAD_STATUSES = [
  { value: "NEW", label: "New", className: "bg-sky-100 text-sky-800" },
  { value: "CONTACTED", label: "Contacted", className: "bg-amber-100 text-amber-800" },
  { value: "QUALIFIED", label: "Qualified", className: "bg-violet-100 text-violet-800" },
  { value: "CONVERTED", label: "Converted", className: "bg-brand-100 text-brand-700" },
  { value: "LOST", label: "Lost", className: "bg-ink-100 text-ink-500" },
] as const;

export type LeadStatusValue = (typeof LEAD_STATUSES)[number]["value"];
export const leadStatusSchema = z.enum(LEAD_STATUSES.map((s) => s.value) as [LeadStatusValue, ...LeadStatusValue[]]);

export const CHANNELS = {
  WHATSAPP: "WhatsApp",
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
  TIKTOK: "TikTok",
  UNKNOWN: "Unknown",
} as const;
export type Channel = keyof typeof CHANNELS;

// Share-link ?src= values sellers can use, one per channel.
export const SHARE_CHANNELS: { src: string; channel: Exclude<Channel, "UNKNOWN"> }[] = [
  { src: "whatsapp", channel: "WHATSAPP" },
  { src: "facebook", channel: "FACEBOOK" },
  { src: "instagram", channel: "INSTAGRAM" },
  { src: "tiktok", channel: "TIKTOK" },
];

// Maps ?src= to a channel. Anything unrecognised is UNKNOWN, never a guess.
// Also returns a sanitised copy of the raw value to keep as evidence.
export function parseChannel(raw: string | string[] | null | undefined): { channel: Channel; utmSource: string | null } {
  const value = (Array.isArray(raw) ? raw[0] : raw)?.trim().toLowerCase().slice(0, 40) ?? "";
  const utmSource = value.replace(/[^a-z0-9_.-]/g, "") || null;
  const aliases: Record<string, Channel> = { wa: "WHATSAPP", fb: "FACEBOOK", ig: "INSTAGRAM", tt: "TIKTOK" };
  const match = SHARE_CHANNELS.find((c) => c.src === utmSource)?.channel ?? (utmSource ? aliases[utmSource] : undefined);
  return { channel: match ?? "UNKNOWN", utmSource };
}

// Customer contact numbers: SA cell or landline in local or +27 form, or an
// international number with a leading "+". Returns E.164 or null.
export function normalisePhone(raw: string): string | null {
  const digits = raw.trim().replace(/[\s\-().]/g, "");
  if (!/^\+?\d+$/.test(digits)) return null;
  let e164: string;
  if (digits.startsWith("+")) e164 = digits;
  else if (digits.startsWith("00")) e164 = `+${digits.slice(2)}`;
  else if (digits.startsWith("27")) e164 = `+${digits}`;
  else if (digits.startsWith("0")) e164 = `+27${digits.slice(1)}`;
  else return null;
  if (e164.startsWith("+27")) return /^\+27[1-8]\d{8}$/.test(e164) ? e164 : null;
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}

// Click-to-chat link. Opens WhatsApp with a message typed in; it does not
// send anything by itself.
export function whatsappLink(e164: string, text: string): string {
  return `https://wa.me/${e164.replace(/^\+/, "")}?text=${encodeURIComponent(text)}`;
}

export function whatsappGreeting(businessName: string): string {
  return `Hi ${businessName}, I saw your campaign on REACH and I'd like to know more.`;
}

export const leadFormSchema = z.object({
  name: z.string().trim().min(2, "Enter your name.").max(80, "Keep your name under 80 characters."),
  contact: z
    .string()
    .trim()
    .min(1, "Enter a number the seller can reach you on.")
    .transform((v, ctx) => {
      const e164 = normalisePhone(v);
      if (!e164) {
        ctx.addIssue({ code: "custom", message: "Enter a valid phone number, e.g. 082 123 4567." });
        return z.NEVER;
      }
      return e164;
    }),
  message: z
    .string()
    .trim()
    .max(500, "Keep your message under 500 characters.")
    .transform((v) => (v === "" ? null : v)),
  consent: z.literal("on", { message: "Please tick the box so the seller may contact you." }),
});

// Honeypot field name. It is hidden from people; naive bots fill it in. The
// server treats a filled honeypot as success without saving, so bots get no
// signal to adapt to.
export const HONEYPOT_FIELD = "website";

export type LeadFormInput = z.output<typeof leadFormSchema>;

// Lead rate limits. Per campaign is the main one; the global per-IP cap is
// generous because many South African mobile users share carrier IPs.
export const LEAD_LIMITS = {
  windowMinutes: 10,
  perCampaign: 5,
  perIp: 30,
  duplicateHours: 24,
} as const;
