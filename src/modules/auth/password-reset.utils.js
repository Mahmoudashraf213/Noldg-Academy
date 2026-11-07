import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { prisma } from "../../../db/index.js";
import { normalizeWhatsAppPhone, sendWhatsAppResetCode } from "../../utils/whatsapp.js";
import { messages } from "../../utils/constant/messages.js";

const deliveryKey = () => createHash("sha256").update(`whatsapp-delivery:${process.env.PASSWORD_RESET_SECRET}`).digest();

export const encryptResetCode = (code) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deliveryKey(), iv);
  const encrypted = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
};

const decryptResetCode = (value) => {
  const payload = Buffer.from(value, "base64");
  const decipher = createDecipheriv("aes-256-gcm", deliveryKey(), payload.subarray(0, 12));
  decipher.setAuthTag(payload.subarray(12, 28));
  return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString("utf8");
};

// Delivery is asynchronous so account existence does not depend on provider response time.
export const deliverPasswordResetCode = async () => {
  if (process.env.WHATSAPP_ENABLED !== "true") return;
  let challenge;
  try {
    await prisma.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw`SELECT "userId" FROM "password_resets" WHERE "delivered" = false AND "encryptedCode" IS NOT NULL AND "deliveryAttempts" < 3 AND "expiresAt" > NOW() AND "nextDeliveryAt" <= NOW() ORDER BY "lastSentAt" LIMIT 1 FOR UPDATE SKIP LOCKED`;
      if (!rows.length) return;
      challenge = await transaction.passwordReset.findUnique({ where: { userId: rows[0].userId } });
      const user = await transaction.user.findUnique({ where: { id: challenge.userId }, select: { phone: true, sessionVersion: true, status: true } });
      if (!user || user.phone !== challenge.phone || user.sessionVersion !== challenge.sessionVersion || user.status !== "active") {
        await transaction.passwordReset.delete({ where: { userId: challenge.userId } });
        return;
      }
      await sendWhatsAppResetCode(normalizeWhatsAppPhone(challenge.phone), decryptResetCode(challenge.encryptedCode));
      await transaction.passwordReset.update({ where: { userId: challenge.userId }, data: { delivered: true, encryptedCode: null } });
    });
  } catch (error) {
    if (challenge) await prisma.passwordReset.updateMany({ where: { userId: challenge.userId, challengeId: challenge.challengeId, delivered: false }, data: { deliveryAttempts: { increment: 1 }, nextDeliveryAt: new Date(Date.now() + 60000) } }).catch(() => {});
    console.error(messages.auth.resetDeliveryFailed, error.code || error.name);
  }
};

export const startPasswordResetDelivery = () => {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { await deliverPasswordResetCode(); } finally { running = false; }
  };
  run();
  const interval = setInterval(run, 5000);
  interval.unref();
};
