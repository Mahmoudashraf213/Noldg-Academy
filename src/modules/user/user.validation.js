import joi from "joi";
import { generalFields } from "../../utils/generalFields.js";
import { userStatuses } from "../../utils/constant/enum.js";

// Validate the account identifier in user-specific routes.
export const userIdSchema = joi.object({
  userId: generalFields.objectId.required(),
});

// Limit account listing to a safe page size.
export const getUsersSchema = joi.object({
  page: generalFields.page.default(1),
  limit: generalFields.limit.default(20),
});

// Validate the account details required to create an admin.
export const createAdminSchema = joi.object({
  name: generalFields.name.required(),
  email: generalFields.email.required(),
  phone: generalFields.phone.required(),
  password: generalFields.password.required(),
});

// Accept only supported account status values.
export const updateUserStatusSchema = joi.object({
  status: joi.string().valid(...Object.values(userStatuses)).required(),
});

