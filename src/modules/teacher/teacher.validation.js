import joi from "joi";
import { AppError } from "../../utils/appError.js";
import { generalFields } from "../../utils/generalFields.js";
import { messages } from "../../utils/constant/messages.js";
import { teacherApprovalStatuses } from "../../utils/constant/enum.js";

// Validate credentials and teaching details for a new teacher account.
export const teacherSignupSchema = joi.object({
  name: generalFields.name.required(),
  email: generalFields.email.required(),
  phone: generalFields.phone.required(),
  password: generalFields.password.required(),
  bio: generalFields.bio.required(),
  offerings: generalFields.offerings.required(),
});

// Validate teaching declarations selected from existing track-subject links.
export const teacherApplicationSchema = joi.object({
  bio: generalFields.bio.required(),
  offerings: generalFields.offerings.required(),
});

// Parse the teaching declarations sent as JSON in a multipart form.
export const parseTeacherOfferings = (req, res, next) => {
  if (typeof req.body.offerings !== "string") {
    return next();
  }

  try {
    req.body.offerings = JSON.parse(req.body.offerings);
    next();
  } catch {
    return next(new AppError(messages.error.invalidRequest, 400));
  }
};

// Validate editable teacher profile details and teaching declarations.
export const updateTeacherProfileSchema = joi.object({
  name: generalFields.name.optional(),
  email: generalFields.email.optional(),
  phone: generalFields.phone.optional(),
  bio: generalFields.bio.optional(),
  offerings: generalFields.offerings.optional(),
});

// Validate pagination and optional application status filtering.
export const getTeacherApplicationsSchema = joi.object({
  page: generalFields.page.default(1),
  limit: generalFields.limit.default(20),
  status: joi.string().valid(...Object.values(teacherApprovalStatuses)).optional(),
});

// Validate a public teacher account identifier.
export const teacherIdSchema = joi.object({
  teacherId: generalFields.objectId.required(),
});

// Validate an application identifier in route parameters.
export const teacherApplicationIdSchema = joi.object({
  applicationId: generalFields.objectId.required(),
});

// Allow account managers to approve or reject an application.
export const reviewTeacherApplicationSchema = joi.object({
  status: joi.string().valid(
    teacherApprovalStatuses.APPROVED,
    teacherApprovalStatuses.REJECTED
  ).required(),
});

// Validate pagination for the public list of teachers.
export const getTeachersSchema = joi.object({
  page: generalFields.page.default(1),
  limit: generalFields.limit.default(20),
});
