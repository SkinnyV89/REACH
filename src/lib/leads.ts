import "server-only";
import { db } from "@/lib/db";
import type { LeadStatusValue } from "@/lib/lead-rules";

// Seller lead management. Every query is scoped by the seller id from
// requireSeller(); another seller's lead id behaves like a missing one.

export class LeadError extends Error {
  constructor(public readonly code: "NOT_FOUND", message: string) {
    super(message);
  }
}

export async function listLeads(sellerId: string, status?: LeadStatusValue) {
  return db.lead.findMany({
    where: { sellerId, ...(status ? { status } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      name: true,
      contact: true,
      message: true,
      status: true,
      channel: true,
      source: true,
      createdAt: true,
      sellerCampaign: { select: { id: true, headline: true } },
    },
  });
}

export async function countLeadsByStatus(sellerId: string) {
  const rows = await db.lead.groupBy({ by: ["status"], where: { sellerId }, _count: { _all: true } });
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.status] = r._count._all;
  return { ...counts, total: rows.reduce((n, r) => n + r._count._all, 0) } as Partial<Record<LeadStatusValue, number>> & {
    total: number;
  };
}

export async function updateLeadStatus(userId: string, sellerId: string, leadId: string, status: LeadStatusValue) {
  return db.$transaction(async (tx) => {
    const { count } = await tx.lead.updateMany({ where: { id: leadId, sellerId }, data: { status } });
    if (count === 0) throw new LeadError("NOT_FOUND", "That lead could not be found.");
    await tx.auditLog.create({
      data: { actorId: userId, action: `lead.status_${status.toLowerCase()}`, entity: "lead", entityId: leadId },
    });
  });
}

// Engagement counts for one of the seller's campaigns, from our own events.
export async function campaignStats(sellerId: string, sellerCampaignId: string) {
  const [views, clicks, leads] = await Promise.all([
    db.attributionEvent.count({ where: { sellerId, sellerCampaignId, eventType: "VIEW" } }),
    db.attributionEvent.count({ where: { sellerId, sellerCampaignId, eventType: "WHATSAPP_CLICK" } }),
    db.lead.count({ where: { sellerId, sellerCampaignId } }),
  ]);
  return { views, clicks, leads };
}
