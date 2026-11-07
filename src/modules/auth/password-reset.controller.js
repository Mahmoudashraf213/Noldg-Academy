import { createHmac, randomBytes, randomInt, timingSafeEqual } from "crypto";
import bcrypt from "bcrypt";
import { prisma } from "../../../db/index.js";
import { AppError } from "../../utils/appError.js";
import { messages } from "../../utils/constant/messages.js";
import { deviceStatuses, roles, userStatuses } from "../../utils/constant/enum.js";
import { assertWhatsAppResetConfigured, normalizeWhatsAppPhone } from "../../utils/whatsapp.js";
import { encryptResetCode } from "./password-reset.utils.js";

const resetRoles = [roles.STUDENT, roles.TEACHER, roles.ADMIN];
const hashCode = (userId, challengeId, code) => createHmac("sha256", process.env.PASSWORD_RESET_SECRET).update(`${userId}:${challengeId}:${code}`).digest("hex");
const resetResponse = (res) => res.status(200).json({ message: messages.auth.resetRequested, success: true });

export const forgotPassword = async (req, res) => {
  assertWhatsAppResetConfigured();
  const email = req.body.email.trim().toLowerCase();
  await prisma.$transaction(async (transaction) => {
    const users = await transaction.$queryRaw`SELECT "id", clock_timestamp() AS "now" FROM "users" WHERE "email" = ${email} FOR UPDATE`;
    if (!users.length) return null;
    const user = await transaction.user.findFirst({ where: { id: users[0].id, status: userStatuses.ACTIVE, roles: { in: resetRoles } } });
    if (!user) return null;
    const phone = normalizeWhatsAppPhone(user.phone);
    if (!phone) return null;
    const existing = await transaction.passwordReset.findUnique({ where: { userId: user.id } });
    const now = users[0].now;
    if (existing && now.getTime() - existing.lastSentAt.getTime() < 60000) return null;
    const code = String(randomInt(100000, 1000000));
    const challengeId = randomBytes(16).toString("hex");
    const data = { challengeId, codeHash: hashCode(user.id, challengeId, code), encryptedCode: encryptResetCode(code), deliveryAttempts: 0, nextDeliveryAt: now, phone: user.phone, sessionVersion: user.sessionVersion, attempts: 0, delivered: false, expiresAt: new Date(now.getTime() + 300000), lastSentAt: now };
    await transaction.passwordReset.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
    return null;
  });
  return resetResponse(res);
};

export const resetPassword = async (req, res, next) => {
  assertWhatsAppResetConfigured();
  const email = req.body.email.trim().toLowerCase();
  const password = await bcrypt.hash(req.body.password, 10);
  const reset = await prisma.$transaction(async (transaction) => {
    const users = await transaction.$queryRaw`SELECT "id", clock_timestamp() AS "now" FROM "users" WHERE "email" = ${email} FOR UPDATE`;
    if (!users.length) return false;
    const user = await transaction.user.findFirst({ where: { id: users[0].id, status: userStatuses.ACTIVE, roles: { in: resetRoles } } });
    if (!user) return false;
    const challenge = await transaction.passwordReset.findUnique({ where: { userId: user.id } });
    if (!challenge || !challenge.delivered || challenge.expiresAt <= users[0].now || challenge.attempts >= 5 || challenge.phone !== user.phone || challenge.sessionVersion !== user.sessionVersion) return false;
    const candidate = hashCode(user.id, challenge.challengeId, req.body.code);
    if (!timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(challenge.codeHash, "hex"))) {
      await transaction.passwordReset.update({ where: { userId: user.id }, data: { attempts: { increment: 1 } } });
      return false;
    }
    await transaction.user.update({ where: { id: user.id }, data: { password, sessionVersion: { increment: 1 }, activeDeviceId: null, activeSessionExpiresAt: null } });
    await transaction.device.updateMany({ where: { userId: user.id, status: deviceStatuses.ACTIVE }, data: { status: deviceStatuses.INACTIVE } });
    await transaction.playbackSession.updateMany({ where: { studentId: user.id, status: "active" }, data: { status: "closed", closedAt: new Date() } });
    await transaction.passwordReset.delete({ where: { userId: user.id } });
    return true;
  });
  if (!reset) return next(new AppError(messages.auth.resetInvalid, 400));
  return res.status(200).json({ message: messages.auth.passwordReset, success: true });
};
