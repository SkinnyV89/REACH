import { z } from "zod";
import { distanceKm, type LatLng } from "@/lib/explore-rules";
import { normalisePhone } from "@/lib/lead-rules";

// The seller's collection point: a precise pin set at the shop, an address
// buyers can read, and an optional number for calls. Pure and shared.

export const PIN_MAX_FROM_TOWN_KM = 60;
export const ADDRESS_MAX = 150;

// South Africa's bounding box (as the database checks it).
export function inSouthAfrica(p: LatLng): boolean {
  return p.latitude >= -35.5 && p.latitude <= -21.5 && p.longitude >= 16 && p.longitude <= 33.5;
}

// A pin is kept to 5 decimals (about 1 m): precise enough for directions.
export function roundPin(value: number): number {
  return Math.round(value * 100_000) / 100_000;
}

// Why a pin can't be used, or null when it's fine. It must be in South Africa
// and near the town the seller chose, which catches a pin set from the wrong
// place (or a phone reporting a stale location).
export function pinProblem(pin: LatLng, town: (LatLng & { name: string }) | null): string | null {
  if (![pin.latitude, pin.longitude].every(Number.isFinite) || !inSouthAfrica(pin)) return "That location isn't in South Africa.";
  if (town && distanceKm(pin, town) > PIN_MAX_FROM_TOWN_KM) {
    return `That location is more than ${PIN_MAX_FROM_TOWN_KM} km from ${town.name}. Set it while you're at your shop, or change your town first.`;
  }
  return null;
}

// Opens Google Maps with directions to the pin (outside REACH, as agreed for
// directions and calls).
export function directionsUrl(p: LatLng): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`;
}

// For the seller to check where their pin is.
export function checkPinUrl(p: LatLng): string {
  return `https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}`;
}

export const collectionSchema = z
  .object({
    offersCollection: z.boolean(),
    collectionAddress: z
      .string()
      .trim()
      .max(ADDRESS_MAX, `Keep the address under ${ADDRESS_MAX} characters.`)
      .transform((v) => (v === "" ? null : v)),
    callNumber: z
      .string()
      .trim()
      .transform((v, ctx) => {
        if (v === "") return null;
        const e164 = normalisePhone(v);
        if (!e164) {
          ctx.addIssue({ code: "custom", message: "Enter a phone number like 073 102 1410." });
          return z.NEVER;
        }
        return e164;
      }),
  })
  .superRefine((v, ctx) => {
    if (v.offersCollection && !v.collectionAddress) {
      ctx.addIssue({ code: "custom", path: ["collectionAddress"], message: "Add the address buyers collect from." });
    }
  });

export type CollectionInput = z.infer<typeof collectionSchema>;
