import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-form";
import { safeNextPath } from "@/lib/auth-rules";
import { getSession } from "@/lib/session";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Create your account · REACH" };

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string; intent?: string }> }) {
  const sp = await searchParams;
  const next = safeNextPath(sp.next);
  const selling = sp.intent === "sell";
  if (await getSession()) redirect(next ?? (selling ? "/onboarding" : "/home"));
  return (
    <AuthShell
      title="Create your REACH account"
      subtitle={
        selling
          ? "Free to join. Next, you'll set up your business so customers can find you."
          : "Free to join. Follow local sellers and see their latest work. You can start selling any time."
      }
      footer={
        <>
          Already have an account?{" "}
          <Link href={next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in"} className="font-semibold text-brand-700 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm next={next ?? (selling ? "/onboarding" : "/feed")} />
    </AuthShell>
  );
}
