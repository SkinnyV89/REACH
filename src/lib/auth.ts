import "server-only";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/lib/auth-rules";

const secret = process.env.BETTER_AUTH_SECRET;
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";
if (process.env.NODE_ENV === "production" && !isBuildPhase && (!secret || secret.length < 32)) {
  throw new Error("BETTER_AUTH_SECRET must be set to at least 32 characters in production.");
}

export const auth = betterAuth({
  // The build imports this module but never signs anything; the placeholder
  // only silences Better Auth's missing-secret error during `next build`.
  secret: secret ?? (isBuildPhase ? "build-phase-placeholder-never-used-at-runtime" : undefined),
  baseURL: process.env.BETTER_AUTH_URL,
  database: prismaAdapter(db, { provider: "postgresql", transaction: true }),

  advanced: {
    // Schema ids are UUID strings; Better Auth's default ids are not UUIDs.
    database: { generateId: () => randomUUID() },
  },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: PASSWORD_MIN_LENGTH,
    maxPasswordLength: PASSWORD_MAX_LENGTH,
    autoSignIn: true,
    // Turned on once an email provider is chosen (see docs/decisions).
    requireEmailVerification: false,
    password: {
      hash: (password) => argon2.hash(password, { type: argon2.argon2id }),
      verify: ({ hash, password }) => argon2.verify(hash, password),
    },
  },

  user: {
    additionalFields: {
      // Exposed on the session for authorisation checks; never accepted from
      // sign-up input, so a user cannot make themselves an admin.
      role: { type: "string", required: false, defaultValue: "MEMBER", input: false },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh expiry at most once a day
  },

  rateLimit: {
    enabled: process.env.NODE_ENV === "production" || process.env.AUTH_RATE_LIMIT === "on",
    // Stored in Postgres so limits hold across serverless instances.
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 600, max: 5 },
    },
  },

  // Must stay last: lets server actions set auth cookies via next/headers.
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
