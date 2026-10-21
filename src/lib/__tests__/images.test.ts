import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { ImageError, processImage } from "@/lib/images";

// Real sharp, real images: these tests prove what leaves the server.

const photo = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 120, b: 60 } } });

// A JPEG carrying GPS coordinates, camera details and a timestamp, like a
// phone photo.
async function phonePhoto(width = 1200, height = 900, orientation?: number) {
  let img = photo(width, height).withExif({
    IFD0: { Make: "PhoneCo", Model: "Pixelmaster 9", DateTime: "2026:10:20 09:15:00" },
    IFD3: { GPSLatitudeRef: "S", GPSLatitude: "26/1 16/1 3000/100", GPSLongitudeRef: "E", GPSLongitude: "27/1 51/1 4200/100" },
  });
  if (orientation) img = img.withMetadata({ orientation });
  return img.jpeg().toBuffer();
}

async function codeOf(promise: Promise<unknown>) {
  try {
    await promise;
    return "ok";
  } catch (error) {
    return error instanceof ImageError ? error.code : String(error);
  }
}

describe("processImage", () => {
  it("removes GPS location, camera details and all other metadata", async () => {
    const input = await phonePhoto();
    const before = await sharp(input).metadata();
    expect(before.exif?.toString("latin1")).toContain("Pixelmaster");
    expect(before.exif?.length).toBeGreaterThan(100);

    for (const out of await processImage(input, "product")) {
      const meta = await sharp(out.data).metadata();
      expect(meta.format).toBe("webp");
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.iptc).toBeUndefined();
      expect(out.data.toString("latin1")).not.toContain("Pixelmaster");
      expect(out.data.toString("latin1")).not.toContain("PhoneCo");
    }
  });

  it("turns photos upright using the camera's orientation", async () => {
    // Stored landscape, but the camera says "rotate 90°" (portrait shot).
    const [lg] = await processImage(await phonePhoto(800, 400, 6), "product");
    expect({ width: lg.width, height: lg.height }).toEqual({ width: 400, height: 800 });
    expect((await sharp(lg.data).metadata()).orientation).toBeUndefined();
  });

  it("makes a large and a small size for item photos, without enlarging", async () => {
    const big = await processImage(await photo(4000, 3000).jpeg().toBuffer(), "product");
    expect(big.map((i) => [i.name, i.width, i.height])).toEqual([
      ["lg", 1600, 1200],
      ["sm", 480, 360],
    ]);
    const small = await processImage(await photo(300, 300).png().toBuffer(), "product");
    expect(small.map((i) => [i.name, i.width])).toEqual([
      ["lg", 300],
      ["sm", 300],
    ]);
  });

  it("makes wide covers and square logos, keeping logo transparency", async () => {
    const cover = await processImage(await photo(3000, 1000).webp().toBuffer(), "cover");
    expect(cover.map((i) => [i.name, i.width, i.height])).toEqual([
      ["lg", 1600, 533],
      ["sm", 800, 267],
    ]);
    const transparent = await sharp({ create: { width: 500, height: 300, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .png()
      .toBuffer();
    const logo = await processImage(transparent, "logo");
    expect(logo).toHaveLength(1);
    expect([logo[0].width, logo[0].height]).toEqual([256, 256]);
    expect((await sharp(logo[0].data).metadata()).hasAlpha).toBe(true);
  });

  it("judges the file by its contents, not its name or type", async () => {
    expect(await codeOf(processImage(Buffer.from("definitely not an image"), "product"))).toBe("not_an_image");
    expect(await codeOf(processImage(Buffer.alloc(0), "product"))).toBe("not_an_image");
    expect(await codeOf(processImage(await photo(300, 300).gif().toBuffer(), "product"))).toBe("unsupported_format");
    expect(await codeOf(processImage(await photo(300, 300).tiff().toBuffer(), "product"))).toBe("unsupported_format");
    // SVG can carry scripts; never accepted.
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><script>alert(1)</script></svg>');
    expect(await codeOf(processImage(svg, "logo"))).toBe("unsupported_format");
  });

  it("rejects photos that are too small", async () => {
    expect(await codeOf(processImage(await photo(150, 600).jpeg().toBuffer(), "product"))).toBe("too_small");
    expect(await codeOf(processImage(await photo(100, 100).png().toBuffer(), "logo"))).toBe("ok");
  });

  it("refuses huge images before decoding them (decompression bombs)", async () => {
    // A tiny PNG whose header claims 20,000 x 20,000 pixels.
    const real = await photo(1, 1).png().toBuffer();
    const forged = Buffer.from(real);
    forged.writeUInt32BE(20000, 16); // IHDR width
    forged.writeUInt32BE(20000, 20); // IHDR height
    expect(await codeOf(processImage(forged, "product"))).toBe("too_many_pixels");
  });

  it("rejects truncated files", async () => {
    const jpeg = await phonePhoto();
    expect(await codeOf(processImage(jpeg.subarray(0, Math.floor(jpeg.length / 3)), "product"))).toBe("not_an_image");
  });
});
