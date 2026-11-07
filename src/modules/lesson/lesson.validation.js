import joi from "joi";
import { generalFields } from "../../utils/generalFields.js";
import { messages } from "../../utils/constant/messages.js";
import { lessonStatuses, lessonTypes } from "../../utils/constant/enum.js";

const validateAvailabilityWindow = (value, helpers) => {
  if (new Date(value.availableUntil) <= new Date(value.availableFrom)) {
    return helpers.error("lesson.availabilityWindow");
  }

  return value;
};

const availabilityWindowRule = {
  "lesson.availabilityWindow": messages.lesson.availabilityWindowInvalid,
};

const lessonUploadFields = {
  videoUploadToken: joi.string().max(4096).optional(),
  attachmentUploadTokens: joi.array().items(joi.string().max(4096)).max(10).unique().optional(),
};

export const lessonUploadSchema = joi.object({
  kind: joi.string().valid("video", "attachment").required(),
  name: joi.string().trim().max(255).pattern(/^[^/\\\x00-\x1f]+\.(mp4|webm|mov|pdf|jpeg|jpg|png|webp|doc|docx|xls|xlsx|ppt|pptx)$/i).required(),
}).custom((value, helpers) => {
  const video = /\.(mp4|webm|mov)$/i.test(value.name);
  return video === (value.kind === "video") ? value : helpers.error("any.invalid");
});

// Validate a course identifier in lesson creation and listing routes.
export const lessonCourseParamsSchema = joi.object({
  courseId: generalFields.objectId.required(),
});

// Validate the lesson identifier in lesson management routes.
export const lessonIdParamsSchema = joi.object({
  lessonId: generalFields.objectId.required(),
});

// Validate all required details for a new recorded lesson.
export const createLessonSchema = joi.object({
  ...lessonUploadFields,
  title: generalFields.name.max(150).required(),
  description: joi.string().trim().max(5000).required(),
  type: joi.string().valid(lessonTypes.RECORDED).required(),
  isFree: joi.boolean().default(false),
  availableFrom: generalFields.dateTime.required(),
  availableUntil: generalFields.dateTime.required(),
}).custom(validateAvailabilityWindow).messages(availabilityWindowRule);

// Validate any editable lesson details and paired availability times.
export const updateLessonSchema = joi.object({
  ...lessonUploadFields,
  title: generalFields.name.max(150).optional(),
  description: joi.string().trim().max(5000).optional(),
  type: joi.string().valid(...Object.values(lessonTypes)).optional(),
  isFree: joi.boolean().optional(),
  availableFrom: generalFields.dateTime.optional(),
  availableUntil: generalFields.dateTime.optional(),
}).custom((value, helpers) => {
  const hasStart = value.availableFrom !== undefined;
  const hasEnd = value.availableUntil !== undefined;

  if (hasStart !== hasEnd) {
    return helpers.error("lesson.availabilityWindow");
  }

  if (hasStart) return validateAvailabilityWindow(value, helpers);
  return value;
}).messages(availabilityWindowRule);

// Allow a teacher to publish, return to draft, or archive a lesson.
export const updateLessonStatusSchema = joi.object({
  status: joi.string().valid(...Object.values(lessonStatuses)).required(),
});
