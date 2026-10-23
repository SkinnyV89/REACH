import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Account deleted · REACH", robots: { index: false } };

export default function AccountDeletedPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-ink-100 px-4 text-center">
      <h1 className="text-2xl font-bold text-ink-900">Your account has been deleted</h1>
      <p className="mt-2 max-w-sm text-ink-700">Your sign-in, the sellers you followed and your notifications are gone.</p>
      <Link href="/" className="mt-6 font-semibold text-brand-700 hover:underline">
        REACH home
      </Link>
    </main>
  );
}
