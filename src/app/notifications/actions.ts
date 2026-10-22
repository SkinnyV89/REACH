"use server";

import { markAllRead } from "@/lib/notifications";
import { requireSession } from "@/lib/session";

// Called once the notifications page has been shown, so a link prefetch
// can never mark notifications as read.
export async function markNotificationsReadAction() {
  const session = await requireSession();
  await markAllRead(session.user.id);
}
