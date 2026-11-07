import joi from "joi";
import { generalFields } from "../../utils/generalFields.js";
import { orderStatuses } from "../../utils/constant/enum.js";

// Accept one product per student purchase without client-supplied prices.
export const createOrderSchema = joi.object({
  productId: generalFields.objectId.required(),
});

// Allow account managers to create a purchase for an existing student.
export const createManualOrderSchema = createOrderSchema.keys({
  studentId: generalFields.objectId.required(),
});

// Validate a purchase identifier in order and payment routes.
export const orderIdParamsSchema = joi.object({
  orderId: generalFields.objectId.required(),
});

// Validate a student's purchase history filters.
export const getMyOrdersSchema = joi.object({
  page: generalFields.page.default(1),
  limit: generalFields.limit.default(20),
  status: joi.string().valid(...Object.values(orderStatuses)).optional(),
  referenceNumber: joi.string().trim().max(64).optional(),
});

// Allow account managers to filter purchases by student or teacher.
export const getOrdersSchema = getMyOrdersSchema.keys({
  studentId: generalFields.objectId.optional(),
  teacherId: generalFields.objectId.optional(),
});
