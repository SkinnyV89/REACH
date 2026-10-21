import { randomInt } from "node:crypto";
import { z } from "zod";

// Rules for campaign copy: the shape the AI must return, the checks applied
// before anything is saved, and how master copy becomes a seller's copy.
// Pure functions, no I/O, so they can be tested exhaustively.

export const LIMITS = {
  title: 60,
  objective: 200,
  headline: 70,
  body: 400,
  callToAction: 40,
} as const;

// The structure the model is asked to return. Lengths and honesty rules are
// enforced by validateMasterCopy() afterwards, so a violation becomes precise
// feedback for a retry instead of an opaque parse failure.
export const masterCopySchema = z.object({
  title: z.string(),
  objective: z.string(),
  headline: z.string(),
  body: z.string(),
  call_to_action: z.string(),
});

export type MasterCopy = z.infer<typeof masterCopySchema>;

export const PLACEHOLDERS = ["business_name", "location"] as const;
const PLACEHOLDER_RE = /\{\{\s*([^{}]*?)\s*\}\}/g;

// Claims a master campaign may never make: it is shared by many sellers and
// knows nothing about any of them. Each entry is [pattern, what to tell the model].
const BANNED: [RegExp, string][] = [
  [/\bR\s?\d/i, "a rand amount"],
  [/\d\s?%|\bper\s?cent\b/i, "a percentage"],
  [/\b(discount|sale|special offer|promo(tion)?|deal)s?\b/i, "a discount or promotion"],
  [/\bfree\b/i, 'the word "free"'],
  [/\bguarantee(d|s)?\b/i, "a guarantee"],
  [/\b(the best|best in|best quality|best price|cheapest|lowest price|number one)\b|#\s?1\b/i, "a superlative claim"],
  [/\b(cure[sd]?|heals?|healing|clinically|doctor|medical)\b/i, "a health or medical claim"],
  [/\b(earn|income|make money|get rich)\b/i, "an income claim"],
  [/\b(reviews?|testimonials?|rated|stars?|award(-winning|s)?)\b/i, "reviews, ratings or awards"],
  [/https?:\/\/|www\.|\.co\.za\b|\.com\b/i, "a link"],
  [/(\+?\d[\s-]?){9,}/, "a phone number"],
  [/@\w/, "a social media handle"],
];

export type CopyViolation = { field: keyof MasterCopy | "copy"; problem: string };

const FIELDS: [keyof MasterCopy, number, string][] = [
  ["title", LIMITS.title, "title"],
  ["objective", LIMITS.objective, "objective"],
  ["headline", LIMITS.headline, "headline"],
  ["body", LIMITS.body, "body"],
  ["call_to_action", LIMITS.callToAction, "call_to_action"],
];

// Returns every rule the copy breaks; an empty list means it may be saved.
export function validateMasterCopy(copy: MasterCopy): CopyViolation[] {
  const out: CopyViolation[] = [];

  for (const [field, max, label] of FIELDS) {
    const value = copy[field].trim();
    if (value.length === 0) out.push({ field, problem: `${label} is empty` });
    else if (value.length > max) {
      out.push({ field, problem: `${label} is ${value.length} characters; the limit is ${max}` });
    }
    for (const [pattern, what] of BANNED) {
      if (pattern.test(value)) out.push({ field, problem: `${label} contains ${what}` });
    }
    for (const match of value.matchAll(PLACEHOLDER_RE)) {
      if (!(PLACEHOLDERS as readonly string[]).includes(match[1])) {
        out.push({ field, problem: `${label} uses an unknown placeholder {{${match[1]}}}` });
      }
    }
    if (/[{}]/.test(value.replace(PLACEHOLDER_RE, ""))) {
      out.push({ field, problem: `${label} contains stray curly braces` });
    }
  }

  const sellerFacing = `${copy.headline}\n${copy.body}`;
  if (!/\{\{\s*business_name\s*\}\}/.test(sellerFacing)) {
    out.push({ field: "copy", problem: "{{business_name}} must appear in the headline or the body" });
  }
  const all = FIELDS.map(([f]) => copy[f]).join("\n");
  const locations = [...all.matchAll(/\{\{\s*location\s*\}\}/g)].length;
  if (locations > 1) out.push({ field: "copy", problem: "{{location}} may be used at most once" });

  return out;
}

export function describeViolations(violations: CopyViolation[]): string {
  return violations.map((v) => `- ${v.problem}`).join("\n");
}

// ---------------------------------------------------------------------------
// Personalisation
// ---------------------------------------------------------------------------

export type SellerFacts = { businessName: string; location: string | null };

// Fills placeholders from the seller's verified profile. The values are the
// seller's own words; nothing here is AI-written.
export function personalise(text: string, facts: SellerFacts): string {
  return text.replace(PLACEHOLDER_RE, (_, name: string) => {
    if (name === "business_name") return facts.businessName;
    if (name === "location") return facts.location?.trim() || "your area";
    return "";
  });
}

export function personaliseCopy(
  master: { headline: string; body: string; callToAction: string },
  facts: SellerFacts,
) {
  return {
    headline: personalise(master.headline, facts),
    body: personalise(master.body, facts),
    callToAction: personalise(master.callToAction, facts),
  };
}

// ---------------------------------------------------------------------------
// Share links
// ---------------------------------------------------------------------------

export const CODE_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/l/I
export const SHARE_CODE_LENGTH = 8;

// 8 characters from 56 symbols ≈ 46 bits: unguessable for practical purposes,
// and short enough to read out or type from a WhatsApp Status.
export function generateShareCode(length = SHARE_CODE_LENGTH): string {
  let code = "";
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export function shareLinkPath(sellerSlug: string, code: string): string {
  return `${sellerSlug}-${code}`;
}

export const SHARE_LINK_RE = new RegExp(`^[a-z0-9-]+-[${CODE_ALPHABET}]{${SHARE_CODE_LENGTH}}$`);

// ---------------------------------------------------------------------------
// Template fallback (no AI provider configured)
// ---------------------------------------------------------------------------

// Plain, honest copy that works for any category. Saved with
// source = TEMPLATE and always labelled as such, never presented as AI output.
export function templateMasterCopy(category: { name: string }): MasterCopy {
  const name = category.name.toLowerCase();
  // Never truncate mid-placeholder: fall back to shorter headlines instead.
  const headline =
    [`Looking for ${name}? Meet {{business_name}}`, `${category.name} from {{business_name}}`].find(
      (h) => h.length <= LIMITS.headline,
    ) ?? "Meet {{business_name}}";
  return {
    title: `${category.name}: introduce your business`.slice(0, LIMITS.title),
    objective: `Introduce local customers to a ${name} seller and get them to send a message.`,
    headline,
    body:
      `{{business_name}} offers ${name} in {{location}}. ` +
      "Send a message to ask what's available and how to get it.",
    call_to_action: "Message us on WhatsApp",
  };
}
