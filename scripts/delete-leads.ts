// Operator command for deletion requests sent to REACH (see /privacy).
//
//   npm run lead:delete -- "<phone number>"            # shows what would be deleted
//   npm run lead:delete -- "<phone number>" --confirm  # deletes permanently
//
// Deletes every lead with that number, across all sellers, and audits it.
import "dotenv/config";
import { db } from "@/lib/db";
import { normalisePhone } from "@/lib/lead-rules";
import { deleteLeadsByContact } from "@/lib/leads";

async function main() {
  const args = process.argv.slice(2);
  const raw = args.find((a) => !a.startsWith("--"));
  const contact = raw ? normalisePhone(raw) : null;
  if (!contact) {
    console.error('Usage: npm run lead:delete -- "<phone number>" [--confirm]');
    process.exitCode = 1;
    return;
  }
  try {
    const matches = await db.lead.groupBy({ by: ["sellerId"], where: { contact }, _count: { _all: true } });
    const total = matches.reduce((n, m) => n + m._count._all, 0);
    if (total === 0) {
      console.log(`No leads found for ${contact}.`);
      return;
    }
    const sellers = await db.seller.findMany({
      where: { id: { in: matches.map((m) => m.sellerId) } },
      select: { id: true, businessName: true },
    });
    console.log(`${total} lead(s) for ${contact}:`);
    for (const m of matches) {
      console.log(`  ${m._count._all} with ${sellers.find((s) => s.id === m.sellerId)?.businessName ?? m.sellerId}`);
    }
    if (!args.includes("--confirm")) {
      console.log("\nNothing deleted. Re-run with --confirm to delete permanently.");
      return;
    }
    const deleted = await deleteLeadsByContact(contact, null);
    console.log(`\nDeleted ${deleted} lead(s). Logged in audit_logs as lead.deleted_on_request.`);
  } finally {
    await db.$disconnect();
  }
}

main();
