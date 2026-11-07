import path from "path";
import express from "express";
import dotenv from "dotenv";
import { dbConnection } from "./db/connection.js";
import { bootStrap } from "./src/bootStrap.js";
import { messages } from "./src/utils/constant/messages.js";
import { startLessonVideoCleanup } from "./src/modules/lesson/lesson.utils.js";
import { startAssessmentAttemptCleanup } from "./src/modules/attempt/attempt.utils.js";
import { startNotificationFanout } from "./src/modules/notification/notification.utils.js";
import { startMediaCleanup } from "./src/utils/media-cleanup.js";
import { startPasswordResetDelivery } from "./src/modules/auth/password-reset.utils.js";
import { startSecurityCleanup } from "./src/utils/security-cleanup.js";

dotenv.config({ path: path.resolve("config/.env"), quiet: true });

// Create the HTTP app and load its middleware and routes.
const app = express();
const port = process.env.PORT || 3000;

bootStrap(app, express);

// Start listening only after the Neon database connection is ready.
try {
  await dbConnection();
  if (!process.env.VERCEL) {
    startLessonVideoCleanup();
    startAssessmentAttemptCleanup();
    startNotificationFanout();
    startMediaCleanup();
    startPasswordResetDelivery();
    startSecurityCleanup();
    app.listen(port, () => console.log(messages.app.listening(port)));
  }
} catch (error) {
  console.error(messages.app.startupFailed, error.message);
  if (process.env.VERCEL) throw error;
  process.exitCode = 1;
}

export default app;

