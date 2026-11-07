import joi from "joi";
import { generalFields } from "../../utils/generalFields.js";

export const ratingTeacherParamsSchema = joi.object({
  teacherId: generalFields.objectId.required(),
});

export const saveRatingSchema = joi.object({
  stars: joi.number().integer().min(1).max(5).required(),
  comment: joi.string().trim().max(500).allow("").optional(),
});

export const getRatingsSchema = joi.object({
  page: generalFields.page.default(1),
  limit: generalFields.limit.default(20),
});
