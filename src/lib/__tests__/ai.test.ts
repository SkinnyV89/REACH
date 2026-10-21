import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const parse = vi.fn();

// Replace the client but keep the SDK's real error classes.
vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  class FakeAnthropic {
    static AuthenticationError = actual.default.AuthenticationError;
    static PermissionDeniedError = actual.default.PermissionDeniedError;
    static RateLimitError = actual.default.RateLimitError;
    static BadRequestError = actual.default.BadRequestError;
    static APIError = actual.default.APIError;
    beta = { messages: { parse } };
  }
  return { ...actual, default: FakeAnthropic };
});

const Anthropic = (await vi.importActual<typeof import("@anthropic-ai/sdk")>("@anthropic-ai/sdk")).default;

const schema = z.object({ headline: z.string() });
const request = { system: "sys", messages: [{ role: "user" as const, content: "hi" }], schema };

const okResponse = {
  stop_reason: "end_turn",
  parsed_output: { headline: "Hello" },
  content: [{ type: "text", text: '{"headline":"Hello"}' }],
  model: "claude-opus-5-5",
  usage: { input_tokens: 120, output_tokens: 40 },
};

async function loadAI(key: string | undefined) {
  vi.resetModules();
  if (key) process.env.ANTHROPIC_API_KEY = key;
  else delete process.env.ANTHROPIC_API_KEY;
  return import("@/lib/ai");
}

// Braces matter: a function returned from beforeEach runs as a teardown hook,
// and mockReset() returns the mock itself, which would then be called.
beforeEach(() => {
  parse.mockReset();
});

describe("ai", () => {
  it("reports not configured without a key, and never calls the API", async () => {
    const ai = await loadAI(undefined);
    expect(ai.isAIConfigured()).toBe(false);
    await expect(ai.generateStructured(request)).rejects.toMatchObject({ kind: "not_configured" });
    expect(parse).not.toHaveBeenCalled();
  });

  it("sends a structured-output request with fallbacks and returns the parsed output", async () => {
    const ai = await loadAI("test-key");
    parse.mockResolvedValue(okResponse);
    const result = await ai.generateStructured(request);
    expect(result).toMatchObject({
      output: { headline: "Hello" },
      model: "claude-opus-5-5",
      usage: { inputTokens: 120, outputTokens: 40 },
    });
    const params = parse.mock.calls[0][0];
    expect(params).toMatchObject({
      model: "claude-opus-5-5",
      system: "sys",
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
    });
    expect(params.output_config.format).toBeDefined();
    expect(params).not.toHaveProperty("thinking"); // can't be disabled on this model; omitted = adaptive
  });

  it.each([
    [{ ...okResponse, stop_reason: "refusal", stop_details: { category: "cyber" }, parsed_output: null }, "refusal"],
    [{ ...okResponse, stop_reason: "max_tokens", parsed_output: null }, "truncated"],
    [{ ...okResponse, parsed_output: null }, "invalid_output"],
  ])("turns a bad response into a typed error (%#)", async (response, kind) => {
    const ai = await loadAI("test-key");
    parse.mockResolvedValue(response);
    await expect(ai.generateStructured(request)).rejects.toMatchObject({ kind });
  });

  it.each([
    ["auth", () => new Anthropic.AuthenticationError(401, undefined, "bad key", new Headers())],
    ["rate_limited", () => new Anthropic.RateLimitError(429, undefined, "slow down", new Headers())],
    ["unavailable", () => new Anthropic.APIError(529, undefined, "overloaded", new Headers())],
    ["unavailable", () => new Error("socket hang up")],
  ] as const)("maps SDK errors to %s", async (kind, makeError) => {
    const ai = await loadAI("test-key");
    parse.mockImplementation(async () => {
      throw makeError();
    });
    await expect(ai.generateStructured(request)).rejects.toMatchObject({ kind });
    expect(parse).toHaveBeenCalledTimes(1);
  });
});
