import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy notice · REACH" };

// DRAFT, pending legal review. Plain-language notice covering the data the
// product actually collects today. Update it whenever collection changes.
const CONTACT_EMAIL = "malingaskinny@gmail.com";
const LAST_UPDATED = "21 October 2026";

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-ink-100 px-4 py-10">
      <article className="mx-auto max-w-2xl rounded-2xl border border-ink-300/60 bg-white p-6 shadow-sm sm:p-8">
        <p role="note" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
          Draft, pending legal review. This notice has not yet been reviewed by a lawyer.
        </p>
        <h1 className="mt-6 text-3xl font-bold text-ink-900">Privacy notice</h1>
        <p className="mt-1 text-sm text-ink-500">Last updated {LAST_UPDATED}</p>

        <div className="mt-6 space-y-6 text-ink-700 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-ink-900 [&_li]:mt-1 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
          <section>
            <h2>Who we are</h2>
            <p className="mt-2">
              REACH is a marketing platform that helps independent sellers and small businesses in South Africa reach
              new customers. We aim to handle personal information in line with the Protection of Personal Information
              Act (POPIA).
            </p>
          </section>

          <section>
            <h2>If you send an enquiry to a seller</h2>
            <ul>
              <li>
                <strong>What we collect:</strong> your name, your phone number, your message (if you write one), the
                campaign you enquired about, and the time you agreed to be contacted.
              </li>
              <li>
                <strong>Why:</strong> so that the seller you contacted can reply to your enquiry. We do not use your
                details for anything else, and we do not sell them.
              </li>
              <li>
                <strong>Who sees it:</strong> only that seller, in their REACH account. Other sellers cannot see it.
              </li>
              <li>
                <strong>Your choice:</strong> sending an enquiry is optional. You can also contact the seller directly
                on WhatsApp instead.
              </li>
            </ul>
          </section>

          <section>
            <h2>If you open a campaign page</h2>
            <p className="mt-2">
              We count page visits and taps on the WhatsApp button so sellers can see whether their campaigns are
              working. To avoid counting the same visit twice, we set a cookie called <code>reach_vid</code> that
              holds a random code. It does not contain your name, number or any other personal details, and we do not
              use it to track you on other websites. It expires after 180 days. To limit spam, we also keep a coded
              (hashed) version of your internet address for a short time; we do not store the address itself.
            </p>
          </section>

          <section>
            <h2>If you sell on REACH</h2>
            <p className="mt-2">
              We store your account details (name, email, password in encrypted form) and the business profile,
              products and campaigns you add, to run your account and show your campaigns to customers. Your WhatsApp
              number and business details are shown on the campaign pages you publish.
            </p>
          </section>

          <section>
            <h2>How long we keep it</h2>
            <p className="mt-2">
              Enquiries stay in the seller&apos;s account until the seller or REACH deletes them, or until you ask us to
              delete them.
            </p>
          </section>

          <section>
            <h2>Your rights</h2>
            <p className="mt-2">
              You can ask us what information we hold about you, ask us to correct it, or ask us to delete it. Email{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-brand-700 underline">
                {CONTACT_EMAIL}
              </a>{" "}
              with the phone number you used and, if you can, the seller&apos;s name. You can also ask the seller you
              contacted: they can delete your enquiry from their REACH account. You may also complain to the Information
              Regulator of South Africa.
            </p>
          </section>
        </div>

        <p className="mt-8 text-sm">
          <Link href="/" className="font-semibold text-brand-700 hover:underline">
            ← REACH home
          </Link>
        </p>
      </article>
    </main>
  );
}
