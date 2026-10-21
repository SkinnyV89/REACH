import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  getCurrentSeller: vi.fn(),
  uploadImage: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ getSession: mocks.getSession, getCurrentSeller: mocks.getCurrentSeller }));
vi.mock("@/lib/media", async () => {
  class MediaError extends Error {
    constructor(public readonly code: string) {
      super(code);
    }
  }
  return { MediaError, uploadImage: mocks.uploadImage };
});

const { POST } = await import("../route");
const { MediaError } = await import("@/lib/media");

const PRODUCT = "33333333-3333-4333-8333-333333333333";

function request(fields: Record<string, string | Blob>, headers: Record<string, string> = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return new Request("http://localhost:3000/api/uploads", { method: "POST", body: form, headers });
}
const file = (bytes = 10) => new File([new Uint8Array(bytes)], "photo.jpg", { type: "image/jpeg" });

describe("POST /api/uploads", () => {
  beforeEach(() => {
    mocks.getSession.mockReset().mockResolvedValue({ user: { id: "user-1" } });
    mocks.getCurrentSeller.mockReset().mockResolvedValue({ id: "seller-1", status: "ACTIVE" });
    mocks.uploadImage.mockReset().mockResolvedValue({ id: "m1", url: "https://x/lg.webp", thumbUrl: "https://x/sm.webp" });
  });

  it("uploads for the signed-in seller, ignoring any seller id sent by the browser", async () => {
    const res = await POST(request({ file: file(), target: "product", productId: PRODUCT, peopleConsent: "on", sellerId: "seller-2" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, media: { id: "m1", url: "https://x/lg.webp", thumbUrl: "https://x/sm.webp" } });
    expect(mocks.uploadImage).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", sellerId: "seller-1", target: "product", productId: PRODUCT, peopleConsent: true }),
    );
  });

  it("never sends a product id for logos and covers", async () => {
    await POST(request({ file: file(), target: "logo", productId: PRODUCT }));
    expect(mocks.uploadImage).toHaveBeenCalledWith(expect.objectContaining({ target: "logo", productId: null, peopleConsent: false }));
  });

  it("refuses signed-out users and unfinished sellers", async () => {
    mocks.getSession.mockResolvedValue(null);
    expect((await POST(request({ file: file(), target: "logo" }))).status).toBe(401);
    mocks.getSession.mockResolvedValue({ user: { id: "user-1" } });
    mocks.getCurrentSeller.mockResolvedValue({ id: "seller-1", status: "ONBOARDING" });
    expect((await POST(request({ file: file(), target: "logo" }))).status).toBe(401);
    expect(mocks.uploadImage).not.toHaveBeenCalled();
  });

  it("refuses requests from other sites", async () => {
    const res = await POST(request({ file: file(), target: "logo" }, { origin: "https://evil.example" }));
    expect(res.status).toBe(400);
    expect(mocks.uploadImage).not.toHaveBeenCalled();
  });

  it("refuses oversized files before processing them", async () => {
    const big = await POST(request({ file: file(4 * 1024 * 1024 + 1), target: "logo" }));
    expect(big.status).toBe(413);
    expect(await big.json()).toEqual({ ok: false, error: "too_large" });
    const declared = await POST(request({ file: file(), target: "logo" }, { "content-length": String(6 * 1024 * 1024) }));
    expect(declared.status).toBe(413);
    expect(mocks.uploadImage).not.toHaveBeenCalled();
  });

  it("rejects malformed requests", async () => {
    for (const fields of <Record<string, string | Blob>[]>[
      { target: "logo" }, // no file
      { file: file(), target: "avatar" },
      { file: file(), target: "product", productId: "not-a-uuid" },
      { file: file(), target: "logo", altText: "x".repeat(201) },
    ]) {
      expect((await POST(request(fields))).status).toBe(400);
    }
    expect((await POST(request({ file: file(0), target: "logo" }))).status).toBe(400);
    expect(mocks.uploadImage).not.toHaveBeenCalled();
  });

  it("passes on upload errors as codes with matching statuses", async () => {
    for (const [code, status] of [
      ["limit_reached", 400],
      ["not_found", 404],
      ["rate_limited", 429],
      ["storage_not_configured", 503],
    ] as const) {
      mocks.uploadImage.mockRejectedValueOnce(new MediaError(code));
      const res = await POST(request({ file: file(), target: "logo" }));
      expect([res.status, (await res.json()).error]).toEqual([status, code]);
    }
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.uploadImage.mockRejectedValueOnce(new Error("boom"));
    const res = await POST(request({ file: file(), target: "logo" }));
    expect([res.status, (await res.json()).error]).toEqual([500, "failed"]);
  });
});
