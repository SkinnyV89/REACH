import "server-only";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { del, put } from "@vercel/blob";

// Where uploaded files are kept. Two backends behind one small interface:
//
// - Vercel Blob (public store), whenever BLOB_READ_WRITE_TOKEN is set.
// - Local disk, for development and automated tests only. Used in
//   `next dev`, or when UPLOADS_DRIVER=local is set explicitly. It refuses to
//   run on Vercel, so a deployment can never quietly keep photos on a
//   server's temporary disk.
//
// Keys are paths like "media/<media id>/lg.webp". Media ids are random UUIDs,
// so keys can't be guessed or collide, and public URLs reveal nothing about
// the seller (their id stays internal).

export interface Storage {
  readonly name: "vercel-blob" | "local";
  put(key: string, data: Buffer, contentType: string): Promise<{ url: string }>;
  delete(keys: string[]): Promise<void>;
}

export class StorageNotConfiguredError extends Error {
  constructor() {
    super("No file storage is configured (set BLOB_READ_WRITE_TOKEN).");
  }
}

const KEY_RE = /^media\/[0-9a-f-]{36}\/(lg|sm)\.webp$/;

export function isValidKey(key: string): boolean {
  return KEY_RE.test(key);
}

function assertKey(key: string) {
  if (!isValidKey(key)) throw new Error("Invalid storage key.");
}

// Files are immutable (a replaced photo gets a new id), so they can be cached
// for a year.
const CACHE_SECONDS = 60 * 60 * 24 * 365;

export function vercelBlobStorage(token: string): Storage {
  return {
    name: "vercel-blob",
    async put(key, data, contentType) {
      assertKey(key);
      const blob = await put(key, data, {
        access: "public",
        contentType,
        token,
        addRandomSuffix: false,
        cacheControlMaxAge: CACHE_SECONDS,
      });
      return { url: blob.url };
    },
    async delete(keys) {
      keys.forEach(assertKey);
      // del() accepts pathnames as well as full URLs.
      if (keys.length > 0) await del(keys, { token });
    },
  };
}

// Local disk: files under LOCAL_UPLOADS_DIR, served by /dev-uploads/<key>.
export const LOCAL_UPLOADS_DIR = path.join(process.cwd(), ".uploads-dev");
export const LOCAL_UPLOADS_PATH = "/dev-uploads";

export function localStorage(dir = LOCAL_UPLOADS_DIR): Storage {
  return {
    name: "local",
    async put(key, data) {
      assertKey(key);
      const file = path.join(dir, key);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, data, { flag: "wx" }); // never overwrite, like Blob
      return { url: `${LOCAL_UPLOADS_PATH}/${key}` };
    },
    async delete(keys) {
      keys.forEach(assertKey);
      await Promise.all(keys.map((k) => rm(path.join(dir, k), { force: true })));
    },
  };
}

export async function readLocalUpload(key: string, dir = LOCAL_UPLOADS_DIR): Promise<Buffer | null> {
  if (!isValidKey(key)) return null;
  try {
    return await readFile(path.join(dir, key));
  } catch {
    return null;
  }
}

type Env = Record<string, string | undefined>;

// Which backend this server uses, or null if uploads aren't available.
export function storageDriver(env: Env = process.env): "vercel-blob" | "local" | null {
  if (env.BLOB_READ_WRITE_TOKEN) return "vercel-blob";
  if (env.VERCEL) return null; // never local disk on Vercel
  if (env.UPLOADS_DRIVER === "local" || env.NODE_ENV === "development") return "local";
  return null;
}

export function isStorageConfigured(env: Env = process.env): boolean {
  return storageDriver(env) !== null;
}

export function getStorage(env: Env = process.env): Storage {
  const driver = storageDriver(env);
  if (driver === "vercel-blob") return vercelBlobStorage(env.BLOB_READ_WRITE_TOKEN!);
  if (driver === "local") return localStorage();
  throw new StorageNotConfiguredError();
}
