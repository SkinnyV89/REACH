import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-form";
import { getSession } from "@/lib/session";
import { SignUpForm } from "./sign-up-form";

export const metadata: Metadata = { title: "Create your account · REACH" };

export default async function SignUpPage() {
  if (await getSession()) redirect("/dashboard");
  return (
    <AuthShell
      title="Create your REACH account"
      subtitle="Free to join. Open to any independent seller or small business, with no brand membership needed."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/sign-in" className="font-semibold text-brand-700 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm />
    </AuthShell>
  );
}
