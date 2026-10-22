import "server-only";
import { db } from "@/lib/db";

// One account per person. Every account can buy; an account sells once it has
// an active seller profile (created by onboarding).

export class AccountError extends Error {
  constructor(
    public readonly code: "HAS_SELLER",
    message: string,
  ) {
    super(message);
  }
}

// Where someone lands after signing in: sellers on their dashboard (they're
// here to work), everyone else on their feed.
export function homePathFor(seller: { status: string } | null): "/dashboard" | "/feed" {
  return seller?.status === "ACTIVE" ? "/dashboard" : "/feed";
}

// Deletes a buyer's account: sign-ins, follows and notifications go with it.
// Accounts with a seller profile (even an unfinished one) are deleted on
// request by email instead, because leads and campaigns are involved.
export async function deleteBuyerAccount(userId: string) {
  await db.$transaction(async (tx) => {
    if (await tx.seller.findUnique({ where: { userId }, select: { id: true } })) {
      throw new AccountError("HAS_SELLER", "Accounts with a seller profile are deleted on request. Email us and we'll do it.");
    }
    await tx.user.delete({ where: { id: userId } });
    // No actor (the account is gone) and no personal data: just that it happened.
    await tx.auditLog.create({ data: { action: "user.deleted", entity: "user", entityId: userId } });
  });
}
