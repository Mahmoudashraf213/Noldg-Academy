import { prisma } from "../../../db/index.js";
import { isAuthenticated } from "../../middleware/authentication.js";
import { AppError } from "../../utils/appError.js";
import { messages } from "../../utils/constant/messages.js";
import { getNotificationInbox } from "./notification.utils.js";

export const getNotifications = async (req, res) => {
  const inbox = await getNotificationInbox(req.authUser.id, req.validatedQuery);
  return res.status(200).json({ message: messages.notification.fetchedSuccessfully, success: true, ...inbox });
};

export const markNotificationRead = async (req, res, next) => {
  const where = { id: req.validatedParams.notificationId, userId: req.authUser.id };
  const notification = await prisma.notification.findFirst({ where, select: { id: true } });
  if (!notification) return next(new AppError(messages.notification.notExist, 404));
  await prisma.notification.updateMany({ where: { ...where, readAt: null }, data: { readAt: new Date() } });
  return res.status(200).json({ message: messages.notification.read, success: true });
};

export const markAllNotificationsRead = async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.authUser.id, readAt: null }, data: { readAt: new Date() } });
  return res.status(200).json({ message: messages.notification.read, success: true });
};

// Stream committed inbox snapshots across instances without an in-memory event bus.
export const streamNotifications = async (req, res) => {
  const lease = await prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT pg_advisory_xact_lock(710326491::bigint)::text AS "lock"`;
    await transaction.notificationConnection.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    const [owned, total] = await Promise.all([
      transaction.notificationConnection.count({ where: { userId: req.authUser.id } }),
      transaction.notificationConnection.count(),
    ]);
    if (owned >= 2 || total >= 100) {
      res.setHeader("Retry-After", 60);
      throw new AppError(messages.error.rateLimited, 429);
    }
    return transaction.notificationConnection.create({ data: { userId: req.authUser.id, expiresAt: new Date(Date.now() + 60000) } });
  });
  let initialInbox;
  try { initialInbox = await getNotificationInbox(req.authUser.id); } catch (error) {
    await prisma.notificationConnection.deleteMany({ where: { id: lease.id } }).catch(() => {});
    throw error;
  }
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  let closed = false;
  let timer;
  let previous;
  const close = () => {
    if (closed) return;
    closed = true;
    clearTimeout(timer);
    prisma.notificationConnection.deleteMany({ where: { id: lease.id } }).catch(() => {});
    if (!res.writableEnded) res.end();
  };
  const writeInbox = (inbox) => {
    const payload = JSON.stringify({ ...inbox, data: inbox.data.map(({ id, ...row }) => ({ _id: id, ...row })) });
    if (payload !== previous) {
      previous = payload;
      if (!res.write(`event: notifications\ndata: ${payload}\n\n`)) close();
    } else if (!res.write(": heartbeat\n\n")) close();
  };
  const poll = async () => {
    try {
      let authError;
      await isAuthenticated()(req, res, (error) => { authError = error; });
      if (authError || closed) return close();
      const renewed = await prisma.notificationConnection.updateMany({ where: { id: lease.id, expiresAt: { gt: new Date() } }, data: { expiresAt: new Date(Date.now() + 60000) } });
      if (!renewed.count) return close();
      const inbox = await getNotificationInbox(req.authUser.id);
      if (closed) return;
      writeInbox(inbox);
      if (!closed) timer = setTimeout(poll, 3000);
    } catch {
      close();
    }
  };
  res.on("close", close);
  res.on("error", close);
  if (res.destroyed) return close();
  writeInbox(initialInbox);
  if (!closed) timer = setTimeout(poll, 3000);
};
