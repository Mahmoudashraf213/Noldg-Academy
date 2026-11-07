import path from "path";
import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

dotenv.config({ path: path.resolve("config/.env"), quiet: true });

// Use Neon’s direct connection for schema changes and migrations.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    url: process.env.NEON_DIRECT_URL || process.env.NEON_DATABASE_URL,
  },
});
