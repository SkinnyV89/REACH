import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/app-url";

// Storefronts (/s/...) are meant to be found in search. The WhatsApp
// redirect, campaign pages and the signed-in seller area are not.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/s/"],
      disallow: [
        "/go/",
        "/c/",
        "/api/",
        "/dashboard",
        "/onboarding",
        "/storefront",
        "/products",
        "/campaigns",
        "/leads",
        "/analytics",
      ],
    },
    host: appUrl(),
  };
}
