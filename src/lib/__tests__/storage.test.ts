import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const blob = vi.hoisted(() => ({ put: vi.fn(), del: vi.fn() }));
vi.mock("@vercel/blob", () => blob);

const { getStorage, isValidKey, localStorage, readLocalUpload, storageDriver, vercelBlobStorage, StorageNotConfiguredError } =
  await import("@/lib/storage");

const KEY = "media/22222222-2222-4222-8222-222222222222/lg.webp";

describe("storage backend choice", () => {
  it("uses Vercel Blob whenever a token is set", () => {
    expect(storageDriver({ BLOB_READ_WRITE_TOKEN: "t", NODE_ENV: "production" })).toBe("vercel-blob");
    expect(storageDriver({ BLOB_READ_WRITE_TOKEN: "t", NODE_ENV: "development" })).toBe("vercel-blob");
    expect(getStorage({ BLOB_READ_WRITE_TOKEN: "t" }).name).toBe("vercel-blob");
  });

  it("uses local disk only in development or when asked, and never on Vercel", () => {
    expect(storageDriver({ NODE_ENV: "development" })).toBe("local");
    expect(storageDriver({ NODE_ENV: "production", UPLOADS_DRIVER: "local" })).toBe("local");
    expect(storageDriver({ NODE_ENV: "production" })).toBeNull();
    expect(storageDriver({ NODE_ENV: "development", VERCEL: "1" })).toBeNull();
    expect(storageDriver({ UPLOADS_DRIVER: "local", VERCEL: "1" })).toBeNull();
  });

  it("refuses to hand out storage when none is configured", () => {
    expect(() => getStorage({ NODE_ENV: "production" })).toThrow(StorageNotConfiguredError);
  });
});

describe("storage keys", () => {
  it("only accepts REACH's own key shape", () => {
    expect(isValidKey(KEY)).toBe(true);
    expect(isValidKey(KEY.replace("lg.webp", "sm.webp"))).toBe(true);
    for (const bad of ["../etc/passwd", "media/../../x", KEY.replace("lg.webp", "lg.html"), `/${KEY}`, `${KEY}/..`, "media/a/lg.webp", "media/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/lg.webp"]) {
      expect(isValidKey(bad)).toBe(false);
    }
  });
});

describe("Vercel Blob backend", () => {
  beforeEach(() => {
    blob.put.mockReset().mockResolvedValue({ url: `https://store.public.blob.vercel-storage.com/${KEY}` });
    blob.del.mockReset().mockResolvedValue(undefined);
  });

  it("stores public, immutable files under the exact key", async () => {
    const storage = vercelBlobStorage("token-123");
    const result = await storage.put(KEY, Buffer.from("x"), "image/webp");
    expect(result.url).toBe(`https://store.public.blob.vercel-storage.com/${KEY}`);
    expect(blob.put).toHaveBeenCalledWith(KEY, Buffer.from("x"), {
      access: "public",
      contentType: "image/webp",
      token: "token-123",
      addRandomSuffix: false,
      cacheControlMaxAge: 31536000,
    });
  });

  it("deletes by key, and refuses keys it didn't make", async () => {
    const storage = vercelBlobStorage("token-123");
    await storage.delete([KEY]);
    expect(blob.del).toHaveBeenCalledWith([KEY], { token: "token-123" });
    await storage.delete([]);
    expect(blob.del).toHaveBeenCalledTimes(1);
    await expect(storage.put("../x", Buffer.from("x"), "image/webp")).rejects.toThrow();
    await expect(storage.delete(["https://elsewhere.example/file"])).rejects.toThrow();
  });
});

describe("local disk backend", () => {
  let dir: string;
  const dirs: string[] = [];
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "reach-uploads-"));
    dirs.push(dir);
  });
  afterAll(async () => {
    await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
  });

  it("writes, serves and deletes files", async () => {
    const storage = localStorage(dir);
    const { url } = await storage.put(KEY, Buffer.from("webp-bytes"), "image/webp");
    expect(url).toBe(`/dev-uploads/${KEY}`);
    expect(await readFile(path.join(dir, KEY), "utf8")).toBe("webp-bytes");
    expect((await readLocalUpload(KEY, dir))?.toString()).toBe("webp-bytes");
    await expect(storage.put(KEY, Buffer.from("again"), "image/webp")).rejects.toThrow(); // never overwrites
    await storage.delete([KEY]);
    await expect(stat(path.join(dir, KEY))).rejects.toThrow();
    await storage.delete([KEY]); // deleting twice is fine
  });

  it("won't read outside its folder", async () => {
    expect(await readLocalUpload("../../etc/passwd", dir)).toBeNull();
    expect(await readLocalUpload(KEY, dir)).toBeNull();
  });
});
