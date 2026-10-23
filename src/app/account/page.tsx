import type { Metadata } from "next";
import Link from "next/link";
import { BuyerHeader } from "@/components/buyer-header";
import { followingCount } from "@/lib/follows";
import { getCurrentSeller, requireSession } from "@/lib/session";
import { CONTACT_EMAIL } from "@/lib/site";
import { DeleteAccount } from "./delete-account";

export const metadata: Metadata = { title: "Account · REACH" };

export default async function AccountPage() {
  const session = await requireSession();
  const [seller, following] = await Promise.all([getCurrentSeller(), followingCount(session.user.id)]);
  const sells = seller?.status === "ACTIVE";

  return (
    <div className="min-h-screen bg-ink-100">
      <BuyerHeader userId={session.user.id} current="account" />
      <main className="mx-auto max-w-xl space-y-6 px-4 py-6">
        <h1 className="text-2xl font-bold text-ink-900">Account</h1>

        <section className="rounded-2xl border border-ink-300/60 bg-white p-5">
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-ink-500">Name</dt>
              <dd className="font-medium text-ink-900">{session.user.name}</dd>
            </div>
            <div>
              <dt className="text-ink-500">Email</dt>
              <dd className="font-medium text-ink-900">{session.user.email}</dd>
            </div>
            <div>
              <dt className="text-ink-500">Following</dt>
              <dd className="font-medium text-ink-900">
                {following} {following === 1 ? "seller" : "sellers"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl border border-ink-300/60 bg-white p-5">
          <h2 className="font-semibold text-ink-900">{sells ? "Your shop" : "Sell on REACH"}</h2>
          <p className="mt-1 text-sm text-ink-500">
            {sells
              ? `You sell as ${seller!.businessName}. Your feed and follows stay the same.`
              : "Add a free storefront to this account: list what you sell, post your work and get enquiries on WhatsApp."}
          </p>
          <Link
            href={sells ? "/dashboard" : "/onboarding"}
            className="mt-3 inline-block rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            {sells ? "Go to your shop" : seller ? "Finish seller setup" : "Become a seller"}
          </Link>
        </section>

        <section className="rounded-2xl border border-ink-300/60 bg-white p-5">
          <h2 className="font-semibold text-ink-900">Delete account</h2>
          {seller ? (
            <p className="mt-1 text-sm text-ink-700">
              Accounts with a seller profile are deleted on request, because enquiries and campaigns are involved. Email{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-brand-700 underline">
                {CONTACT_EMAIL}
              </a>{" "}
              from this address.
            </p>
          ) : (
            <div className="mt-2">
              <DeleteAccount />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
