import joi from "joi";
import { generalFields } from "../../utils/generalFields.js";
import { entitlementSources } from "../../utils/constant/enum.js";

// Accept one educational grant without client-supplied payment or grant metadata.
export const createGrantSchema = joi.object({
  studentId: generalFields.objectId.required(),
  productId: generalFields.objectId.required(),
  reason: joi.string().trim().max(1000).required(),
});

// Validate pagination and source filtering for a student's content entitlements.
export const getMyEntitlementsSchema = joi.object({
  page: generalFields.page.default(1),
  limit: generalFields.limit.default(20),
  source: joi.string().valid(...Object.values(entitlementSources)).optional(),
});

// Allow account managers to inspect entitlements for a student or a product.
export const getEntitlementsSchema = getMyEntitlementsSchema.keys({
  studentId: generalFields.objectId.optional(),
  productId: generalFields.objectId.optional(),
});
