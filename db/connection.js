import { prisma } from "./prisma.js";
import { messages } from "../src/utils/constant/messages.js";

// Connect to the Neon PostgreSQL database managed through Prisma migrations.
export const dbConnection = async () => {
  if (!process.env.NEON_DATABASE_URL) {
    throw new Error(messages.database.neonUrlMissing);
  }

  await prisma.$connect();
  await prisma.$queryRaw`SELECT 1`;
  console.log(messages.database.connected);
};
