import { prisma } from "../../db/index.js";
import { messages } from "./constant/messages.js";

export const cleanupSecurityRecords = async () => {
  const now = new Date();
  const retention = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await prisma.$transaction([
    prisma.securityRateLimit.deleteMany({ where: { expiresAt: { lte: now } } }),
    prisma.$executeRaw`DELETE FROM "password_resets" WHERE "expiresAt" <= NOW()`,
    prisma.notificationConnection.deleteMany({ where: { expiresAt: { lte: now } } }),
    prisma.notificationFanout.deleteMany({ where: { status: "completed", createdAt: { lt: retention } } }),
    prisma.mediaCleanupTask.deleteMany({ where: { status: "completed", createdAt: { lt: retention } } }),
  ]);
};

export const startSecurityCleanup = () => {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await cleanupSecurityRecords(); } catch (error) { console.error(messages.error.cleanupFailed, error.code || error.name); } finally { running = false; }
  };
  run();
  const interval = setInterval(run, 15 * 60 * 1000);
  interval.unref();
};
