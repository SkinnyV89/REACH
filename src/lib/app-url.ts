import "server-only";

// Public base URL used to build share links. Reuses BETTER_AUTH_URL, which
// must already be the app's public address, so there is one setting to keep right.
export function appUrl(): string {
  return (process.env.APP_URL || process.env.BETTER_AUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export function shareUrl(uniqueLink: string): string {
  return `${appUrl()}/c/${uniqueLink}`;
}
