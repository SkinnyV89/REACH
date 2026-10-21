import { beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
const findUnique = vi.fn();

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }));
vi.mock("@/lib/db", () => ({ db: { seller: { findUnique } } }));

const { requireSession, requireSeller, getCurrentSeller } = await import("@/lib/session");

const session = { user: { id: "user-a", email: "a@example.com", name: "Seller A" }, session: {} };
const sellerA = { id: "seller-a", userId: "user-a", businessName: "Thandi's Hair" };

beforeEach(() => {
  getSession.mockReset();
  findUnique.mockReset();
});

describe("requireSession", () => {
  it("redirects to sign-in when there is no session", async () => {
    getSession.mockResolvedValue(null);
    await expect(requireSession()).rejects.toThrow("REDIRECT:/sign-in");
  });

  it("returns the session when signed in", async () => {
    getSession.mockResolvedValue(session);
    await expect(requireSession()).resolves.toBe(session);
  });
});

describe("requireSeller", () => {
  it("redirects to sign-in when signed out, without querying sellers", async () => {
    getSession.mockResolvedValue(null);
    await expect(requireSeller()).rejects.toThrow("REDIRECT:/sign-in");
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("redirects to seller setup when the user has no seller profile", async () => {
    getSession.mockResolvedValue(session);
    findUnique.mockResolvedValue(null);
    await expect(requireSeller()).rejects.toThrow("REDIRECT:/dashboard");
  });

  it("looks up the seller only by the session user's id", async () => {
    getSession.mockResolvedValue(session);
    findUnique.mockResolvedValue(sellerA);
    await expect(requireSeller()).resolves.toEqual({ session, seller: sellerA });
    expect(findUnique).toHaveBeenCalledWith({ where: { userId: "user-a" } });
  });
});

describe("getCurrentSeller", () => {
  it("returns null without touching the database when signed out", async () => {
    getSession.mockResolvedValue(null);
    await expect(getCurrentSeller()).resolves.toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });
});
