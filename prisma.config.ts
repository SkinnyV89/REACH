// Prisma 7 no longer reads DATABASE_URL from schema.prisma or auto-loads .env.
// This file loads .env and tells the Prisma CLI (migrate, generate, studio)
// where the schema, migrations and database are.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  // Read process.env directly rather than prisma's strict env() helper, so
  // commands that need no database (generate, validate) still work without a
  // .env. Migrate commands will fail clearly if DATABASE_URL is missing.
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
