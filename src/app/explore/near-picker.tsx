"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { exploreHref, roundCoordinate, type ExploreParams } from "@/lib/explore-rules";
import { provinceName } from "@/lib/storefront-rules";
import { chooseTownAction, locateMeAction } from "./actions";

type Town = { slug: string; name: string; province: string };

// "Near: Soweto ▾" plus an optional "Use my location". Choosing a town saves
// it (town only) and reloads Explore for that town.
export function NearPicker({ towns, current, params }: { towns: Town[]; current: string | null; params: Omit<ExploreParams, "near" | "page"> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const provinces = [...new Set(towns.map((t) => t.province))];

  function go(slug: string | null) {
    router.push(exploreHref({ ...params, near: slug }));
  }

  function choose(slug: string) {
    setMessage(null);
    if (!slug) return go(null);
    start(async () => {
      const r = await chooseTownAction(slug);
      if (r.slug) go(r.slug);
      else setMessage(r.error ?? "Something went wrong.");
    });
  }

  function locate() {
    setMessage(null);
    if (!("geolocation" in navigator)) return setMessage("This browser can't share your location. Choose your town instead.");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Rounded here, before anything leaves the phone (about 1 km).
        const lat = roundCoordinate(pos.coords.latitude);
        const lng = roundCoordinate(pos.coords.longitude);
        start(async () => {
          const r = await locateMeAction(lat, lng);
          if (r.slug) go(r.slug);
          else setMessage(r.error ?? "Something went wrong.");
        });
      },
      () => setMessage("Location wasn't shared. Choose your town instead."),
      { enableHighAccuracy: false, maximumAge: 10 * 60_000, timeout: 15_000 },
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="near" className="text-sm font-medium text-ink-900">
          Near
        </label>
        <select
          id="near"
          value={current ?? ""}
          disabled={pending}
          onChange={(e) => choose(e.target.value)}
          className="min-w-0 max-w-[14rem] flex-1 rounded-lg border border-ink-300 bg-white px-3 py-2 text-base text-ink-900"
        >
          <option value="">Anywhere in South Africa</option>
          {provinces.map((p) => (
            <optgroup key={p} label={provinceName(p)}>
              {towns
                .filter((t) => t.province === p)
                .map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <button
          type="button"
          onClick={locate}
          disabled={pending}
          className="inline-flex items-center gap-1 rounded-lg border border-ink-300 bg-white px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100 disabled:opacity-60"
        >
          <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth={2}>
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v3m0 14v3M2 12h3m14 0h3" />
          </svg>
          {pending ? "Finding…" : "Use my location"}
        </button>
      </div>
      <p className="text-xs text-ink-500">We only keep the town, never your exact location.</p>
      {message && (
        <p role="status" className="text-sm text-amber-800">
          {message}
        </p>
      )}
    </div>
  );
}
