import joi from "joi";
import { generalFields } from "../../utils/generalFields.js";

export const getNotificationsSchema = joi.object({
  page: generalFields.page.default(1),
  limit: generalFields.limit.default(20),
  unread: joi.boolean().optional(),
  type: joi.string().trim().max(64).optional(),
});

export const notificationIdParamsSchema = joi.object({
  notificationId: generalFields.objectId.required(),
});
