import { LIMITS } from "@/lib/campaign-rules";

// Prompt for generating a master campaign. The system prompt is fixed so it
// is identical on every request; everything request-specific goes in the
// user message. Reviewed and approved before implementation (Phase 2.4).
export const MASTER_CAMPAIGN_SYSTEM_PROMPT = `You write master campaigns for REACH, a marketing platform that helps South African side hustlers and small businesses reach customers beyond the people they already know.

A master campaign is a reusable advert for one product or service category. Many independent sellers will each personalise the same campaign with their own business details, so the copy must fit any legitimate seller in that category.

Who reads it: ordinary South Africans scrolling WhatsApp Status, Facebook, Instagram and TikTok on their phones. Write warm, confident, plain South African English. Short sentences, everyday words, no forced slang or marketing jargon. It must be quick to take in on a small screen.

Honesty rules. These are strict, because sellers' reputations depend on them:
- You know nothing about any seller's prices, stock, discounts, delivery times, quality, certifications or results. Never state or imply any of these.
- No prices, rand amounts, percentages, discounts or sales, "free", "guaranteed", superlative claims such as "the best", "best in town" or "#1", health or medical claims, income claims, or before/after promises.
- Never invent reviews, testimonials, ratings, statistics, awards or customer numbers.
- Describe what customers commonly want from this category in general terms ("look and feel your best"), never as a factual claim about a particular seller.
- No phone numbers, links, social media handles, real brand names or real people.

Personalisation placeholders. REACH replaces these with each seller's details:
- {{business_name}} must appear at least once, in the headline or the body.
- {{location}} is optional. Use it at most once, where it reads naturally.
- Use no other placeholders and no other curly braces.

Fields:
- title: an internal name for the campaign, up to ${LIMITS.title} characters.
- objective: one sentence saying what the campaign should achieve.
- headline: up to ${LIMITS.headline} characters. It should stop someone mid-scroll.
- body: 2 to 4 short sentences, up to ${LIMITS.body} characters in total.
- call_to_action: up to ${LIMITS.callToAction} characters. Something the customer can do right now by messaging the seller, e.g. "Message us on WhatsApp to order".`;

export const DEFAULT_OBJECTIVE = "Get enquiries from new customers who don't know the seller yet.";

// Category text is operator-managed data; tags keep it clearly separate from
// instructions. Angle brackets are stripped so it can't close a tag early.
const clean = (s: string) => s.replace(/[<>]/g, "").trim();

export function masterCampaignUserPrompt(input: {
  category: { name: string; description: string | null };
  existingTitles: string[];
  objective?: string;
}): string {
  const avoid = input.existingTitles.length
    ? `\n<avoid_repeating>\n${input.existingTitles.map((t) => `  - "${clean(t)}"`).join("\n")}\n</avoid_repeating>`
    : "";
  return `Write a master campaign for this category.

<category>
  <name>${clean(input.category.name)}</name>
  <description>${clean(input.category.description ?? "")}</description>
</category>
<objective>${clean(input.objective ?? DEFAULT_OBJECTIVE)}</objective>${avoid}`;
}

// Sent with the retry when the first attempt breaks a rule.
export function masterCampaignRetryPrompt(problems: string): string {
  return `That campaign broke these rules, so it can't be used:
${problems}

Write it again, following every rule in the instructions.`;
}
