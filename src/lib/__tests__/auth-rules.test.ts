import { describe, expect, it } from "vitest";
import { authErrorMessage, fieldErrors, signInSchema, signUpSchema } from "@/lib/auth-rules";

describe("signUpSchema", () => {
  it("normalises email and accepts a valid sign-up", () => {
    const result = signUpSchema.parse({ name: " Thandi ", email: " Thandi@Example.COM ", password: "a-long-password" });
    expect(result).toEqual({ name: "Thandi", email: "thandi@example.com", password: "a-long-password" });
  });

  it("reports one message per invalid field", () => {
    const result = signUpSchema.safeParse({ name: "", email: "nope", password: "short" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(Object.keys(fieldErrors(result.error)).sort()).toEqual(["email", "name", "password"]);
    }
  });
});

describe("signInSchema", () => {
  it("requires a password", () => {
    expect(signInSchema.safeParse({ email: "a@example.com", password: "" }).success).toBe(false);
  });
});

describe("authErrorMessage", () => {
  it("keeps sign-in failures generic", () => {
    expect(authErrorMessage({ code: "INVALID_EMAIL_OR_PASSWORD" })).toBe("Incorrect email or password.");
  });

  it("explains rate limiting", () => {
    expect(authErrorMessage({ status: 429 })).toMatch(/Too many attempts/);
  });

  it("falls back to a safe default for unknown errors", () => {
    expect(authErrorMessage({ code: "SOMETHING_INTERNAL", message: "stack trace here" })).toBe(
      "Something went wrong. Please try again.",
    );
  });
});
