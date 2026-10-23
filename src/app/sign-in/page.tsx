import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-form";
import { safeNextPath } from "@/lib/auth-rules";
import { getSession } from "@/lib/session";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in · REACH" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNextPath((await searchParams).next);
  // /home sends sellers to their dashboard and everyone else to their feed.
  if (await getSession()) redirect(next ?? "/home");
  return (
    <AuthShell
      title="Welcome back"
      subtitle={next ? "Sign in to carry on where you were." : "Sign in to see your feed, or to manage your shop."}
      footer={
        <>
          New to REACH?{" "}
          <Link href={next ? `/sign-up?next=${encodeURIComponent(next)}` : "/sign-up"} className="font-semibold text-brand-700 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <SignInForm next={next ?? "/home"} />
    </AuthShell>
  );
}
