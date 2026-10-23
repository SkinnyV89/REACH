import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/auth-rules";
import {
  DISCOVERY_FILTERS,
  decodeCursor,
  encodeCursor,
  newPostsMessage,
  parseDiscoveryFilter,
  publicFollowerLabel,
  timeAgo,
} from "@/lib/feed-rules";

describe("feed cursor", () => {
  it("round-trips the publish time and post code", () => {
    const c = { publishedAt: new Date("2026-10-21T14:05:09.123Z"), code: "aB3dE5fG7h" };
    expect(decodeCursor(encodeCursor(c))).toEqual(c);
  });

  it("never carries internal ids, and rejects anything malformed", () => {
    expect(encodeCursor({ publishedAt: new Date(1), code: "aB3dE5fG7h" })).not.toMatch(/[0-9a-f]{8}-/);
    for (const bad of [undefined, "", "x", "abc.def", "zz.aB3dE5fG7h.extra", "-1.aB3dE5fG7h", "lzz.11111111-1111-4111-8111-111111111111", "a".repeat(60)]) {
      expect(decodeCursor(bad), String(bad)).toBeNull();
    }
  });
});

describe("follower counts", () => {
  it("are shown publicly only from 10 followers", () => {
    expect(publicFollowerLabel(0)).toBeNull();
    expect(publicFollowerLabel(9)).toBeNull();
    expect(publicFollowerLabel(10)).toBe("10 followers");
    expect(publicFollowerLabel(12500)).toBe("12 500 followers");
  });
});

describe("notification wording", () => {
  it("groups posts from one seller", () => {
    expect(newPostsMessage("Thandi Braids", 1)).toBe("Thandi Braids shared a new post");
    expect(newPostsMessage("Thandi Braids", 3)).toBe("Thandi Braids shared 3 new posts");
  });
});

describe("timeAgo", () => {
  const now = new Date("2026-10-22T12:00:00Z");
  it("uses plain relative times, then a date", () => {
    expect(timeAgo(new Date("2026-10-22T11:59:30Z"), now)).toBe("just now");
    expect(timeAgo(new Date("2026-10-22T11:55:00Z"), now)).toBe("5 minutes ago");
    expect(timeAgo(new Date("2026-10-22T09:00:00Z"), now)).toBe("3 hours ago");
    expect(timeAgo(new Date("2026-10-21T12:00:00Z"), now)).toBe("yesterday");
    expect(timeAgo(new Date("2026-10-19T12:00:00Z"), now)).toBe("3 days ago");
    expect(timeAgo(new Date("2026-09-01T12:00:00Z"), now)).toBe("1 Sept 2026");
  });
});

describe("discovery filters", () => {
  it("cover the launch categories and ignore unknown keys", () => {
    expect(DISCOVERY_FILTERS.map((f) => f.label)).toEqual(["Hair & Beauty", "Barbers", "Food & Baking"]);
    expect(parseDiscoveryFilter("barbers")?.categories).toEqual(["barbers-mens-grooming"]);
    expect(parseDiscoveryFilter("everything")).toBeNull();
    expect(parseDiscoveryFilter(undefined)).toBeNull();
  });
});

describe("safeNextPath", () => {
  it("allows only paths on this site", () => {
    expect(safeNextPath("/s/thandi-braids")).toBe("/s/thandi-braids");
    expect(safeNextPath("/s/thandi/posts/aB3dE5fG7h?src=whatsapp")).toBe("/s/thandi/posts/aB3dE5fG7h?src=whatsapp");
    for (const bad of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "/\\/evil.example",
      "javascript:alert(1)",
      "evil.example",
      "/ok?next=https://evil.example",
      "/a b",
      "/sign-in",
      "/sign-up?next=/feed",
      "",
      undefined,
      42,
      `/${"a".repeat(400)}`,
    ]) {
      expect(safeNextPath(bad), String(bad)).toBeNull();
    }
  });
});
