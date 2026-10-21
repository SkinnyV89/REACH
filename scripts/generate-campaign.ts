// Dev/operator command: generate a master campaign for a category.
//
//   npm run campaign:generate -- <category-slug> --as <admin-email>
//
// Uses the same code path as the admin server action, including validation
// and AIJob logging. Without ANTHROPIC_API_KEY it creates template copy.
import "dotenv/config";
import { db } from "@/lib/db";
import { isAIConfigured, AI_MODEL } from "@/lib/ai";
import { CampaignError, generateMasterCampaign } from "@/lib/campaigns";

async function main() {
  const args = process.argv.slice(2);
  const slug = args.find((a) => !a.startsWith("--"));
  const asIndex = args.indexOf("--as");
  const email = asIndex >= 0 ? args[asIndex + 1] : undefined;
  if (!slug || !email) {
    const categories = await db.category.findMany({ where: { isActive: true }, orderBy: { sortOrder: "asc" } });
    console.error("Usage: npm run campaign:generate -- <category-slug> --as <admin-email>\n\nCategories:");
    for (const c of categories) console.error(`  ${c.slug.padEnd(28)} ${c.name}`);
    process.exitCode = 1;
    return;
  }

  const admin = await db.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!admin || admin.role !== "ADMIN") {
    console.error(`${email} is not an admin. See README → "Making yourself an admin".`);
    process.exitCode = 1;
    return;
  }
  const category = await db.category.findUnique({ where: { slug } });
  if (!category) {
    console.error(`No category with slug "${slug}". Run without arguments to list them.`);
    process.exitCode = 1;
    return;
  }

  console.log(
    isAIConfigured()
      ? `Generating with ${AI_MODEL} for "${category.name}"…`
      : `ANTHROPIC_API_KEY is not set: creating TEMPLATE copy (not AI-written) for "${category.name}".`,
  );
  try {
    const master = await generateMasterCampaign(admin.id, category.id);
    const job = master.aiJobId ? await db.aIJob.findUnique({ where: { id: master.aiJobId } }) : null;
    console.log(`\nPublished master campaign ${master.id} (source: ${master.source}${master.model ? `, ${master.model}` : ""})`);
    console.log(`  Title:    ${master.title}`);
    console.log(`  Headline: ${master.headline}`);
    console.log(`  Body:     ${master.body}`);
    console.log(`  CTA:      ${master.callToAction}`);
    if (job?.inputTokens != null) {
      console.log(`  Tokens:   ${job.inputTokens} in / ${job.outputTokens} out over ${job.attempts} attempt(s)`);
    }
  } catch (error) {
    console.error(error instanceof CampaignError ? error.message : error);
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

main();
