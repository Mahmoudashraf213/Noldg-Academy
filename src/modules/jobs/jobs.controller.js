import { timingSafeEqual } from "crypto";
import { cleanupExpiredLessonVideos } from "../lesson/lesson.utils.js";
import { cleanupExpiredAssessmentAttempts } from "../attempt/attempt.utils.js";
import { processNotificationFanout } from "../notification/notification.utils.js";
import { deliverPasswordResetCode } from "../auth/password-reset.utils.js";
import { cleanupDetachedMedia } from "../../utils/media-cleanup.js";
import { cleanupSecurityRecords } from "../../utils/security-cleanup.js";
import { AppError } from "../../utils/appError.js";
import { messages } from "../../utils/constant/messages.js";

const jobs = {
  video: cleanupExpiredLessonVideos,
  attempts: cleanupExpiredAssessmentAttempts,
  notifications: processNotificationFanout,
  media: cleanupDetachedMedia,
  recovery: deliverPasswordResetCode,
  security: cleanupSecurityRecords,
};

// Authenticate scheduler requests independently of user access tokens.
export const runJob = async (req, res, next) => {
  const secret = process.env.CRON_SECRET;
  const supplied = Buffer.from(req.headers.authorization || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (!secret || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return next(new AppError(messages.auth.invalidToken, 401));
  }

  await jobs[req.validatedParams.task]();
  return res.status(200).json({ message: messages.app.jobCompleted, success: true });
};
