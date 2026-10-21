import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-form";
import { getSession } from "@/lib/session";
import { SignInForm } from "./sign-in-form";

export const metadata: Metadata = { title: "Sign in · REACH" };

export default async function SignInPage() {
  if (await getSession()) redirect("/dashboard");
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to manage your campaigns and leads."
      footer={
        <>
          New to REACH?{" "}
          <Link href="/sign-up" className="font-semibold text-brand-700 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <SignInForm />
    </AuthShell>
  );
}
