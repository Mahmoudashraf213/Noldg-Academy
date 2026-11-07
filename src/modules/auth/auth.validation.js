import joi from "joi";
import { generalFields } from "../../utils/generalFields.js";

// Validate the required account details for registration.
export const registerSchema = joi.object({
  name: generalFields.name.required(),
  email: generalFields.email.required(),
  phone: generalFields.phone.required(),
  password: generalFields.password.required(),
});

// Require exactly one login identifier together with the password.
export const loginSchema = joi.object({
  name: generalFields.name.optional(),
  email: generalFields.email.optional(),
  password: joi.string().custom((value, helpers) => Buffer.byteLength(value, "utf8") <= 72 ? value : helpers.error("any.invalid")).required(),
}).xor("name", "email");

// Allow profile updates while rejecting an empty update body.
export const updateUserSchema = joi.object({
  name: generalFields.name.optional(),
  email: generalFields.email.optional(),
  phone: generalFields.phone.optional(),
}).min(1);

export const forgotPasswordSchema = joi.object({
  email: generalFields.email.required(),
});

export const resetPasswordSchema = joi.object({
  email: generalFields.email.required(),
  code: joi.string().pattern(/^\d{6}$/).required(),
  password: generalFields.password.required(),
});
