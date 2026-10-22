import "server-only";
import sharp from "sharp";
import { db } from "@/lib/db";
import { AIError, AI_MODEL, AI_PROVIDER, generateStructured, isAIConfigured } from "@/lib/ai";
import { MAX_INPUT_PIXELS } from "@/lib/images";
import {
  MENU_IMAGE_MAX_DIMENSION,
  MENU_IMPORTS_PER_HOUR,
  menuOutputSchema,
  toDraft,
  type MenuDraft,
} from "@/lib/menu-import-rules";
import { MENU_IMPORT_SYSTEM_PROMPT, MENU_IMPORT_USER_PROMPT } from "@/lib/prompts/menu-import";
import { hit } from "@/lib/public-campaigns";

// Reads a seller's flyer or price list into draft items. Nothing is saved to
// the catalogue here: the seller reviews the draft and saves it themselves.
// The photo is not stored anywhere; the AIJob row records only that a read
// happened (no image, no text), for cost and abuse tracking.

export class MenuImportError extends Error {
  constructor(
    public readonly code: "not_configured" | "rate_limited" | "not_an_image" | "unsupported_format" | "failed",
    message: string,
  ) {
    super(message);
  }
}

const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);

// Upright, at most 1568 px on the long side, JPEG, with no metadata (sharp
// writes none unless asked), so the model gets pixels only.
async function prepareImage(input: Buffer): Promise<string> {
  let meta;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
  } catch {
    throw new MenuImportError("not_an_image", "That file isn't a photo we can read.");
  }
  if (!meta.format || !ACCEPTED_FORMATS.has(meta.format)) {
    throw new MenuImportError("unsupported_format", "Use a JPEG, PNG or WebP photo.");
  }
  try {
    const data = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: MENU_IMAGE_MAX_DIMENSION, height: MENU_IMAGE_MAX_DIMENSION, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 85 })
      .toBuffer();
    return data.toString("base64");
  } catch {
    throw new MenuImportError("not_an_image", "That photo could not be opened.");
  }
}

export async function readMenuFromImage(userId: string, sellerId: string, image: Buffer): Promise<MenuDraft> {
  if (!isAIConfigured()) {
    throw new MenuImportError("not_configured", "Reading flyers needs REACH's AI service, which isn't switched on yet. Add your items by hand for now.");
  }
  if ((await hit(`menu-import:${sellerId}`, 60)) > MENU_IMPORTS_PER_HOUR) {
    throw new MenuImportError("rate_limited", `You can read up to ${MENU_IMPORTS_PER_HOUR} flyers an hour. Try again a bit later.`);
  }
  const data = await prepareImage(image);

  const job = await db.aIJob.create({
    data: { taskType: "MENU_IMPORT", requestedBy: userId, provider: AI_PROVIDER, model: AI_MODEL },
  });
  try {
    const result = await generateStructured({
      system: MENU_IMPORT_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data } },
            { type: "text", text: MENU_IMPORT_USER_PROMPT },
          ],
        },
      ],
      schema: menuOutputSchema,
      effort: "medium",
    });
    await db.aIJob.update({
      where: { id: job.id },
      data: {
        status: "SUCCEEDED",
        model: result.model,
        attempts: 1,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        finishedAt: new Date(),
      },
    });
    await db.auditLog.create({ data: { actorId: userId, action: "menu.import_read", entity: "seller", entityId: sellerId } });
    return toDraft(result.output);
  } catch (error) {
    const reason = error instanceof AIError ? `${error.kind}: ${error.message}` : "unexpected error";
    await db.aIJob.update({
      where: { id: job.id },
      data: { status: "FAILED", attempts: 1, error: reason.slice(0, 2000), finishedAt: new Date() },
    });
    if (error instanceof AIError && error.kind === "refusal") {
      throw new MenuImportError("failed", "We couldn't read that photo. Try a different photo of your price list.");
    }
    throw new MenuImportError("failed", "We couldn't read that photo just now. Try again in a minute, or add your items by hand.");
  }
}
