import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 font-sans">
      <div className="max-w-2xl text-center space-y-6">
        <h1 className="text-5xl font-extrabold tracking-tight text-gray-900">
          REACH
        </h1>
        <p className="text-xl text-gray-600">
          REACH gives your side hustle access to customers beyond the people you already know.
        </p>
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 text-left space-y-4">
          <h2 className="text-lg font-bold text-gray-800">The REACH Workflow</h2>
          <ul className="list-disc list-inside text-gray-600 space-y-2">
            <li>AI Campaign Creation</li>
            <li>Seller Personalisation</li>
            <li>Organic & Paid Distribution</li>
            <li>Lead Generation & Management</li>
            <li>Performance Measurement</li>
          </ul>
        </div>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/sign-up?intent=sell"
            className="bg-brand-600 hover:bg-brand-700 text-white font-bold py-3 px-8 rounded-full transition-colors"
          >
            Start Your First Campaign
          </Link>
          <Link href="/explore" className="font-semibold text-brand-700 hover:underline">
            Explore sellers near you
          </Link>
          <Link href="/sign-in" className="font-semibold text-brand-700 hover:underline">
            Already selling with REACH? Sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
