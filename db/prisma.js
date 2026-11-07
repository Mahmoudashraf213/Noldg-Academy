import path from "path";
import dotenv from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: path.resolve("config/.env"), quiet: true });

const databaseSchema = process.env.DATABASE_SCHEMA || "public";
if (!/^[a-z_][a-z0-9_]*$/.test(databaseSchema)) throw new Error("Invalid database schema name");

const adapter = new PrismaPg({
  connectionString: process.env.NEON_DATABASE_URL,
  ...(databaseSchema !== "public" && { options: `-c search_path=${databaseSchema}` }),
}, { schema: databaseSchema });

// Share one Prisma client across the application process.
export const prisma = new PrismaClient({ adapter, transactionOptions: { maxWait: 15000, timeout: 60000 } });
