import joi from "joi";
import { generalFields } from "../../utils/generalFields.js";
import { orderStatuses } from "../../utils/constant/enum.js";

// Accept a final purchase decision and require an explanation for rejection.
export const reviewOrderSchema = joi.object({
  status: joi.string().valid(orderStatuses.APPROVED, orderStatuses.REJECTED).required(),
  receivedBy: generalFields.objectId.when("status", {
    is: orderStatuses.APPROVED,
    then: joi.optional(),
    otherwise: joi.forbidden(),
  }),
  reason: joi.string().trim().max(1000).when("status", {
    is: orderStatuses.REJECTED,
    then: joi.required(),
    otherwise: joi.optional(),
  }),
});

// Validate pagination and unread filtering for an account manager's notifications.
export const getOrderNotificationsSchema = joi.object({
  page: generalFields.page.default(1),
  limit: generalFields.limit.default(20),
  unread: joi.boolean().optional(),
});

// Validate a notification identifier before marking the owner's notification read.
export const notificationIdParamsSchema = joi.object({
  notificationId: generalFields.objectId.required(),
});
