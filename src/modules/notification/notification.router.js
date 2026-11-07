import { Router } from "express";
import { isAuthenticated } from "../../middleware/authentication.js";
import { isValid } from "../../middleware/vaildation.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  streamNotifications,
} from "./notification.controller.js";
import {
  getNotificationsSchema,
  notificationIdParamsSchema,
} from "./notification.validation.js";

const notificationRouter = Router();

notificationRouter.get(
  "/stream",
  isAuthenticated(),
  asyncHandler(streamNotifications)
);
notificationRouter.get(
  "/",
  isAuthenticated(),
  isValid(getNotificationsSchema, "query"),
  asyncHandler(getNotifications)
);
notificationRouter.patch(
  "/read-all",
  isAuthenticated(),
  asyncHandler(markAllNotificationsRead)
);
notificationRouter.patch(
  "/:notificationId/read",
  isAuthenticated(),
  isValid(notificationIdParamsSchema, "params"),
  asyncHandler(markNotificationRead)
);

export default notificationRouter;
