import { z } from "zod";

// Validation and normalisation rules for the seller profile. Shared by the
// onboarding forms (for instant feedback) and the server actions (which are
// the real enforcement point).

export const PROVINCES = [
  { value: "EASTERN_CAPE", label: "Eastern Cape" },
  { value: "FREE_STATE", label: "Free State" },
  { value: "GAUTENG", label: "Gauteng" },
  { value: "KWAZULU_NATAL", label: "KwaZulu-Natal" },
  { value: "LIMPOPO", label: "Limpopo" },
  { value: "MPUMALANGA", label: "Mpumalanga" },
  { value: "NORTH_WEST", label: "North West" },
  { value: "NORTHERN_CAPE", label: "Northern Cape" },
  { value: "WESTERN_CAPE", label: "Western Cape" },
] as const;

export const FULFILMENT_OPTIONS = [
  { value: "DELIVERY", label: "I deliver" },
  { value: "COLLECTION", label: "Customers collect" },
  { value: "ONLINE", label: "Online or remote" },
] as const;

export const MAX_CATEGORIES = 3;

// ---------------------------------------------------------------------------
// WhatsApp number
// ---------------------------------------------------------------------------

// Accepts the ways South Africans usually write a cell number ("082 123 4567",
// "+27 82 123 4567", "27821234567") and international numbers written with a
// leading "+". Returns E.164 ("+27821234567") or null if it is not a valid
// mobile number.
export function normaliseWhatsappNumber(raw: string): string | null {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/[\s\-().]/g, "");
  if (!/^\+?\d+$/.test(digits)) return null;

  let e164: string;
  if (digits.startsWith("+")) e164 = digits;
  else if (digits.startsWith("00")) e164 = `+${digits.slice(2)}`;
  else if (digits.startsWith("27")) e164 = `+${digits}`;
  else if (digits.startsWith("0")) e164 = `+27${digits.slice(1)}`;
  else return null;

  if (e164.startsWith("+27")) {
    // SA mobile numbers: +27 followed by 6x, 7x or 8x and 7 more digits.
    return /^\+27[6-8]\d{8}$/.test(e164) ? e164 : null;
  }
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}

// "+27821234567" -> "082 123 4567"; other countries stay in E.164.
export function formatWhatsappNumber(e164: string | null | undefined): string {
  if (!e164) return "";
  const m = e164.match(/^\+27(\d{2})(\d{3})(\d{4})$/);
  return m ? `0${m[1]} ${m[2]} ${m[3]}` : e164;
}

// ---------------------------------------------------------------------------
// Links
// ---------------------------------------------------------------------------

const SOCIAL_HOSTS = {
  instagram: { hosts: ["instagram.com"], base: "https://www.instagram.com/" },
  facebook: { hosts: ["facebook.com", "fb.com"], base: "https://www.facebook.com/" },
  tiktok: { hosts: ["tiktok.com"], base: "https://www.tiktok.com/@" },
} as const;

export type SocialNetwork = keyof typeof SOCIAL_HOSTS;

function hostMatches(hostname: string, allowed: readonly string[]): boolean {
  const host = hostname.toLowerCase().replace(/^(www\.|m\.)/, "");
  return allowed.includes(host);
}

// Accepts a full profile URL on the right network, or just a handle
// ("@thandihair" / "thandihair"). Returns a canonical https URL, or null.
export function normaliseSocialUrl(network: SocialNetwork, raw: string): string | null {
  const value = raw.trim();
  const { hosts, base } = SOCIAL_HOSTS[network];

  const handle = value.replace(/^@/, "");
  if (/^[A-Za-z0-9._]{1,50}$/.test(handle)) return `${base}${handle}`;

  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (!hostMatches(url.hostname, hosts) || url.pathname.length <= 1) return null;
    url.protocol = "https:";
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

export function normaliseWebsiteUrl(raw: string): string | null {
  const value = raw.trim();
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public slug
// ---------------------------------------------------------------------------

// Words that must never become a seller's public address because they are,
// or may become, app routes.
const RESERVED_SLUGS = new Set([
  "admin", "api", "app", "auth", "dashboard", "help", "login", "logout", "new",
  "onboarding", "privacy", "reach", "seller", "sellers", "settings", "sign-in",
  "sign-out", "sign-up", "signin", "signup", "support", "terms",
]);

export const SLUG_MAX_LENGTH = 48;

// "Thandi's Hair Boutique" -> "thandis-hair-boutique". Never returns a
// reserved word or an empty string.
export function slugify(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip accents
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/g, "");
  if (!base) return "seller";
  return RESERVED_SLUGS.has(base) ? `${base}-shop` : base;
}

// Candidates tried in order when the base slug is taken.
export function slugCandidates(base: string, count = 20): string[] {
  const out = [base];
  for (let n = 2; n < count + 2; n++) {
    const suffix = `-${n}`;
    out.push(`${base.slice(0, SLUG_MAX_LENGTH - suffix.length).replace(/-+$/g, "")}${suffix}`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Step schemas
// ---------------------------------------------------------------------------

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters.`)
    .transform((v) => (v === "" ? null : v));

const optionalLink = (normalise: (raw: string) => string | null, message: string) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return null;
      const url = normalise(v);
      if (!url) {
        ctx.addIssue({ code: "custom", message });
        return z.NEVER;
      }
      return url;
    });

// Step 1: who you are and how customers reach you.
export const businessStepSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(2, "Enter your business or trading name.")
    .max(80, "Keep your business name under 80 characters."),
  whatsappNumber: z
    .string()
    .trim()
    .min(1, "Enter the WhatsApp number customers should use.")
    .transform((v, ctx) => {
      const e164 = normaliseWhatsappNumber(v);
      if (!e164) {
        ctx.addIssue({ code: "custom", message: "Enter a valid cell number, e.g. 082 123 4567." });
        return z.NEVER;
      }
      return e164;
    }),
  description: optionalText(500),
});

// Step 2: what you sell and where.
export const categoriesStepSchema = z.object({
  categoryIds: z
    .array(z.string().uuid())
    .min(1, "Choose at least one category.")
    .max(MAX_CATEGORIES, `Choose up to ${MAX_CATEGORIES} categories.`)
    .transform((ids) => [...new Set(ids)]),
  province: z.enum(PROVINCES.map((p) => p.value) as [string, ...string[]], {
    message: "Choose your province.",
  }),
  location: z.string().trim().min(2, "Enter your town, suburb or area.").max(80, "Keep this under 80 characters."),
  fulfilment: z
    .array(z.enum(FULFILMENT_OPTIONS.map((f) => f.value) as [string, ...string[]]))
    .min(1, "Choose how customers get your products or services.")
    .transform((v) => [...new Set(v)]),
  serviceArea: optionalText(120),
});

// Step 3: optional extras.
export const extrasStepSchema = z.object({
  instagramUrl: optionalLink((v) => normaliseSocialUrl("instagram", v), "Enter an Instagram handle or profile link."),
  facebookUrl: optionalLink((v) => normaliseSocialUrl("facebook", v), "Enter a Facebook page link."),
  tiktokUrl: optionalLink((v) => normaliseSocialUrl("tiktok", v), "Enter a TikTok handle or profile link."),
  websiteUrl: optionalLink(normaliseWebsiteUrl, "Enter a valid website address."),
});

export type BusinessStepInput = z.output<typeof businessStepSchema>;
export type CategoriesStepInput = z.output<typeof categoriesStepSchema>;
export type ExtrasStepInput = z.output<typeof extrasStepSchema>;

// Reads a FormData into the plain shape the step schemas expect. Multi-value
// fields (checkbox groups) become arrays.
export function formDataToObject(form: FormData, arrayFields: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of new Set(form.keys())) {
    if (key.startsWith("$")) continue; // React's internal action fields
    out[key] = arrayFields.includes(key) ? form.getAll(key).map(String) : String(form.get(key) ?? "");
  }
  for (const key of arrayFields) out[key] ??= [];
  return out;
}

export function provinceLabel(value: string | null | undefined): string | undefined {
  return PROVINCES.find((p) => p.value === value)?.label;
}
