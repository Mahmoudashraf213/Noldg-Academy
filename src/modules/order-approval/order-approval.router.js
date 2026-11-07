import { Router } from "express";
import { isAuthenticated } from "../../middleware/authentication.js";
import { isAuthorized } from "../../middleware/autheraization.js";
import { isValid } from "../../middleware/vaildation.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { roles } from "../../utils/constant/enum.js";
import { orderIdParamsSchema } from "../order/order.validation.js";
import {
  getOrderNotifications,
  markOrderNotificationRead,
  reviewOrder,
} from "./order-approval.controller.js";
import {
  getOrderNotificationsSchema,
  notificationIdParamsSchema,
  reviewOrderSchema,
} from "./order-approval.validation.js";

const orderApprovalRouter = Router();
const isAccountManager = isAuthorized([roles.ADMIN, roles.SUPER_ADMIN]);

// Keep purchase notifications available to all active account managers.
orderApprovalRouter.get(
  "/notifications",
  isAuthenticated(),
  isAccountManager,
  isValid(getOrderNotificationsSchema, "query"),
  asyncHandler(getOrderNotifications)
);
orderApprovalRouter.patch(
  "/notifications/:notificationId/read",
  isAuthenticated(),
  isAccountManager,
  isValid(notificationIdParamsSchema, "params"),
  asyncHandler(markOrderNotificationRead)
);

// The first account manager to finalize a submitted payment owns the decision.
orderApprovalRouter.patch(
  "/:orderId/review",
  isAuthenticated(),
  isAccountManager,
  isValid(orderIdParamsSchema, "params"),
  isValid(reviewOrderSchema),
  asyncHandler(reviewOrder)
);

export default orderApprovalRouter;
