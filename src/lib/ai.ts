import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

// The AI provider boundary. Everything that talks to a model goes through
// here, so the rest of the app never imports a provider SDK and the key
// never leaves the server (this module is "server-only").

export const AI_PROVIDER = "anthropic";
export const AI_MODEL = process.env.AI_MODEL || "claude-opus-5-5";

export function isAIConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export class AIError extends Error {
  constructor(
    public readonly kind:
      | "not_configured" // no API key
      | "refusal" // the model declined
      | "truncated" // hit max_tokens before finishing
      | "invalid_output" // response didn't match the schema
      | "auth" // key rejected
      | "rate_limited"
      | "unavailable", // network or provider error
    message: string,
  ) {
    super(message);
  }
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!isAIConfigured()) throw new AIError("not_configured", "ANTHROPIC_API_KEY is not set.");
  // 90s per attempt; the SDK retries 429/5xx/network errors twice by default.
  client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 90_000 });
  return client;
}

export type StructuredResult<T> = {
  output: T;
  // Full assistant content, to append to the conversation for a follow-up
  // turn (it may include thinking blocks, which must be passed back as-is).
  content: Anthropic.Beta.BetaContentBlock[];
  model: string; // the model that actually served the request
  usage: { inputTokens: number; outputTokens: number };
};

// One structured-output request. The response is parsed against `schema`;
// anything else is an AIError with a kind the caller can report.
export async function generateStructured<S extends z.ZodType>(params: {
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  schema: S;
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<StructuredResult<z.infer<S>>> {
  const anthropic = getClient();
  let response;
  try {
    response = await anthropic.beta.messages.parse({
      model: AI_MODEL,
      max_tokens: params.maxTokens ?? 16000,
      system: params.system,
      messages: params.messages,
      output_config: { effort: params.effort ?? "medium", format: betaZodOutputFormat(params.schema) },
      // If a safety classifier declines, the API retries on a fallback model
      // within the same request.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
  } catch (error) {
    throw toAIError(error);
  }

  if (response.stop_reason === "refusal") {
    const category = response.stop_details?.category ?? "unspecified";
    throw new AIError("refusal", `The model declined the request (category: ${category}).`);
  }
  if (response.stop_reason === "max_tokens") {
    throw new AIError("truncated", "The response was cut off before it finished.");
  }
  if (!response.parsed_output) {
    throw new AIError("invalid_output", "The response did not match the expected format.");
  }

  return {
    output: response.parsed_output as z.infer<S>,
    content: response.content,
    model: response.model,
    usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
  };
}

// Maps SDK errors to kinds without leaking request contents into logs.
function toAIError(error: unknown): AIError {
  if (error instanceof AIError) return error;
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new AIError("auth", "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.");
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AIError("rate_limited", "The AI provider is rate limiting requests. Try again shortly.");
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new AIError("unavailable", `The AI provider rejected the request (400): ${error.message}`);
  }
  if (error instanceof Anthropic.APIError) {
    return new AIError("unavailable", `The AI provider returned an error (${error.status ?? "no status"}).`);
  }
  // Includes Anthropic.APIConnectionError (network, timeout).
  return new AIError("unavailable", "Could not reach the AI provider.");
}
