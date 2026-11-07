import { dbConnection } from "./db/connection.js";
import { startLessonVideoCleanup } from "./src/modules/lesson/lesson.utils.js";
import { startAssessmentAttemptCleanup } from "./src/modules/attempt/attempt.utils.js";
import { startNotificationFanout } from "./src/modules/notification/notification.utils.js";
import { startMediaCleanup } from "./src/utils/media-cleanup.js";
import { startPasswordResetDelivery } from "./src/modules/auth/password-reset.utils.js";
import { startSecurityCleanup } from "./src/utils/security-cleanup.js";
import { messages } from "./src/utils/constant/messages.js";

// Keep the existing background schedules on a persistent worker host.
try {
  await dbConnection();
  startLessonVideoCleanup();
  startAssessmentAttemptCleanup();
  startNotificationFanout();
  startMediaCleanup();
  startPasswordResetDelivery();
  startSecurityCleanup();
  // The existing timers are unref'd so the worker needs a referenced timer.
  setInterval(() => {}, 60 * 60 * 1000);
} catch (error) {
  console.error(messages.app.startupFailed, error.message);
  process.exitCode = 1;
}
