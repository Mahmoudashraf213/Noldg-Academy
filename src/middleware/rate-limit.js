import { createHash } from "crypto";
import { prisma } from "../../db/index.js";
import { AppError } from "../utils/appError.js";
import { messages } from "../utils/constant/messages.js";

// Keep counters in PostgreSQL so limits apply across application instances.
export const rateLimit = ({ scope, limit, windowMs, key = (req) => req.ip || req.socket.remoteAddress }) => {
  return async (req, res, next) => {
    const now = Date.now();
    const window = Math.floor(now / windowMs);
    const digest = createHash("sha256").update(`${scope}:${window}:${key(req)}`).digest("hex");
    const counter = await prisma.securityRateLimit.upsert({
      where: { key: digest },
      create: { key: digest, expiresAt: new Date((window + 1) * windowMs) },
      update: { count: { increment: 1 } },
    });
    if (counter.count > limit) {
      res.setHeader("Retry-After", Math.max(1, Math.ceil(((window + 1) * windowMs - now) / 1000)));
      return next(new AppError(messages.error.rateLimited, 429));
    }
    next();
  };
};

export const loginAccountKey = (req) => (req.body.email || req.body.name).trim().toLowerCase();
