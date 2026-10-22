import { redirect } from "next/navigation";
import { homePathFor } from "@/lib/account";
import { getCurrentSeller, requireSession } from "@/lib/session";

// Where signing in lands: sellers on their dashboard, everyone else on their feed.
export default async function HomeRedirect() {
  await requireSession();
  redirect(homePathFor(await getCurrentSeller()));
}
