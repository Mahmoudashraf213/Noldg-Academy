import joi from "joi";
import { generalFields } from "../../utils/generalFields.js";

// Record a manual payment declaration using the server's saved order amount.
export const submitPaymentSchema = joi.object({
  orderId: generalFields.objectId.required(),
  notes: joi.string().trim().max(1000).allow("").optional(),
});
