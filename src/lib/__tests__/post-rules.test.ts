import { describe, expect, it } from "vitest";
import {
  CAPTION_MAX,
  CAPTURE_EXPLAINER,
  MAX_POST_TAGS,
  POST_CODE_RE,
  captionContactProblem,
  captionSchema,
  captureLabel,
  formatPostedDate,
  groupThousands,
  postInputFromForm,
  postInputSchema,
} from "@/lib/post-rules";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("captions", () => {
  it("allows ordinary captions, prices, dates, times and emoji", () => {
    for (const ok of [
      "Waist-length knotless braids for a client in Pimville 💇🏾‍♀️",
      "From R450. Took 6 hours, done on 21/10/2026 at 09:30.",
      "Red velvet cake, 3 tiers, 2.5kg. Orders open for December!",
      "Fade + line-up, R80 (students R60)",
      "e.g. bring your own hair, size 1B",
      "",
    ]) {
      expect(captionContactProblem(ok), ok).toBeNull();
      expect(captionSchema.safeParse(ok).success, ok).toBe(true);
    }
  });

  it("refuses phone numbers, however they're written", () => {
    for (const bad of ["Call 0821234567", "WhatsApp 082 123 4567", "+27 82 123 4567", "+27 (82) 123-4567", "082.123.4567", "dial 0 8 2 1 2 3 4 5 6 7"]) {
      expect(captionContactProblem(bad), bad).toBe("phone");
    }
  });

  it("refuses links and emails", () => {
    for (const bad of ["see https://example.com", "www.mybraids.co.za", "mybraids.co.za", "insta: thandi.shop", "wa.me/27821234567", "bit.ly/abc"]) {
      expect(captionContactProblem(bad), bad).toBe("link");
    }
    expect(captionContactProblem("thandi@example.com")).toBe("email");
    expect(captionSchema.safeParse("mail me: thandi@example.com").error?.issues[0].message).toContain("WhatsApp button");
  });

  it("limits captions to 1,000 characters, after trimming", () => {
    expect(captionSchema.safeParse("a".repeat(CAPTION_MAX)).success).toBe(true);
    expect(captionSchema.safeParse("a".repeat(CAPTION_MAX + 1)).success).toBe(false);
    expect(captionSchema.parse(`  ${"a".repeat(CAPTION_MAX)}  `)).toHaveLength(CAPTION_MAX);
  });
});

describe("number formatting", () => {
  it("groups thousands with a plain space, the same on server and browser", () => {
    expect(groupThousands(1000)).toBe("1 000");
    expect(groupThousands(999)).toBe("999");
    expect(groupThousands(1234567)).toBe("1 234 567");
    expect(captionSchema.safeParse("a".repeat(1001)).error?.issues[0].message).toBe("Keep the caption under 1 000 characters.");
  });
});

describe("post input", () => {
  it("takes caption and tags from a form, removing duplicate tags", () => {
    const form = new FormData();
    form.set("caption", " Fresh fade ");
    form.append("productIds", id(1));
    form.append("productIds", id(1));
    form.append("productIds", id(2));
    expect(postInputSchema.parse(postInputFromForm(form))).toEqual({ caption: "Fresh fade", productIds: [id(1), id(2)] });
  });

  it("allows up to five tags, and only real ids", () => {
    const tags = (n: number) => Array.from({ length: n }, (_, i) => id(i + 1));
    expect(postInputSchema.safeParse({ caption: "", productIds: tags(MAX_POST_TAGS) }).success).toBe(true);
    expect(postInputSchema.safeParse({ caption: "", productIds: tags(MAX_POST_TAGS + 1) }).success).toBe(false);
    expect(postInputSchema.safeParse({ caption: "", productIds: ["not-an-id"] }).success).toBe(false);
  });
});

describe("post codes", () => {
  it("are 10 characters from the unambiguous alphabet", () => {
    expect(POST_CODE_RE.test("aB3dE5fG7h")).toBe(true);
    expect(POST_CODE_RE.test("aB3dE5fG7")).toBe(false);
    expect(POST_CODE_RE.test("aB3dE5fG70")).toBe(false); // 0 isn't used
    expect(POST_CODE_RE.test("../../etc/x")).toBe(false);
  });
});

describe("capture labels", () => {
  it("labels gallery photos plainly, and in-app photos with their time", () => {
    expect(captureLabel("GALLERY", null)).toBe("From gallery");
    expect(captureLabel("GALLERY", new Date())).toBe("From gallery"); // a gallery photo never claims a time
    expect(captureLabel("IN_APP_CAMERA", new Date("2026-10-21T12:05:00Z"))).toBe("Photo taken in REACH · 21 Oct, 14:05");
    expect(captureLabel("IN_APP_CAMERA", null)).toBe("Photo taken in REACH");
  });

  it("explains honestly what each label means", () => {
    expect(CAPTURE_EXPLAINER.GALLERY).toContain("can't tell when it was taken");
    expect(CAPTURE_EXPLAINER.IN_APP_CAMERA).toContain("REACH's camera");
  });

  it("formats the posted date in South African time", () => {
    expect(formatPostedDate(new Date("2026-10-21T23:30:00Z"))).toBe("Posted 22 Oct 2026");
  });
});
