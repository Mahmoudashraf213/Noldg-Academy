import { prisma } from "../../db/index.js";
import cloudinary from "./cloud.js";
import { messages } from "./constant/messages.js";

// Delete detached assets after the database transaction has committed.
export const queueMediaCleanup = (asset, resourceType, authenticated = true, transaction = prisma) => {
  if (!asset?.publicId) return;
  return transaction.mediaCleanupTask.create({ data: { asset, resourceType, authenticated, nextAttemptAt: new Date(0) } });
};

export const cleanupDetachedMedia = async () => {
  let taskId;
  let attempts = 0;
  try {
    await prisma.$transaction(async (transaction) => {
      const tasks = await transaction.$queryRaw`SELECT "id" FROM "media_cleanup_tasks" WHERE "status" = 'pending' AND "nextAttemptAt" <= NOW() ORDER BY "createdAt" LIMIT 1 FOR UPDATE SKIP LOCKED`;
      if (!tasks.length) return;
      taskId = tasks[0].id;
      const task = await transaction.mediaCleanupTask.findUnique({ where: { id: taskId } });
      attempts = task.attempts;
      const result = await cloudinary.uploader.destroy(task.asset.publicId, { resource_type: task.resourceType, type: task.authenticated ? "authenticated" : "upload", timeout: 10000 });
      if (!["ok", "not found"].includes(result.result)) throw new Error(messages.error.cleanupFailed);
      await transaction.mediaCleanupTask.update({ where: { id: taskId }, data: { status: "completed" } });
    });
  } catch (error) {
    if (taskId) await prisma.mediaCleanupTask.updateMany({ where: { id: taskId, status: "pending" }, data: { attempts: { increment: 1 }, status: attempts >= 9 ? "failed" : "pending", nextAttemptAt: new Date(Date.now() + Math.min(3600000, 5000 * 2 ** attempts)) } }).catch(() => {});
    console.error(messages.error.cleanupFailed, taskId || "database", error.code || error.name);
  }
};

export const startMediaCleanup = () => {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await cleanupDetachedMedia(); } finally { running = false; }
  };
  run();
  const interval = setInterval(run, 5000);
  interval.unref();
};
