import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// One PrismaClient per server process. In development, Next.js hot reload
// re-evaluates modules, so the client is cached on globalThis to avoid
// exhausting Neon's connection limit.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// `next build` imports route modules to collect page data but runs no
// queries, so a build must not require database credentials.
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString && !isBuildPhase) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and add your Neon connection string.",
    );
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const db: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
