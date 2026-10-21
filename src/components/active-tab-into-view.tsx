"use client";

import { useEffect } from "react";

// On narrow phones the seller nav can be wider than the screen and scrolls
// sideways. Make sure the current tab is the one in view.
export function ActiveTabIntoView({ navLabel }: { navLabel: string }) {
  useEffect(() => {
    document
      .querySelector<HTMLElement>(`nav[aria-label="${navLabel}"] [aria-current="page"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [navLabel]);
  return null;
}
