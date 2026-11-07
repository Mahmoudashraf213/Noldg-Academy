import joi from "joi";
import { generalFields } from "../../utils/generalFields.js";

const socialLink = joi.string().trim().uri({ scheme: ["http", "https"] }).max(2048).allow("");

// Only these public settings and social link keys can be changed.
export const updateSettingsSchema = joi.object({
  platformName: generalFields.name.max(150).optional(),
  supportEmail: generalFields.email.max(320).allow("").optional(),
  supportPhone: generalFields.phone.max(64).allow("").optional(),
  paymentInstructions: joi.string().trim().max(5000).allow("").optional(),
  socialLinks: joi.object({
    facebook: socialLink.optional(),
    instagram: socialLink.optional(),
    youtube: socialLink.optional(),
    tiktok: socialLink.optional(),
    telegram: socialLink.optional(),
    whatsapp: socialLink.optional(),
  }).optional(),
}).min(1);
