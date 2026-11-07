import joi from "joi";
import { generalFields } from "../../utils/generalFields.js";

export const gradeAttemptSchema = joi.object({
  grades: joi.array().items(joi.object({
    assessmentQuestionId: generalFields.objectId.required(),
    pointsAwarded: joi.number().min(0).precision(2).strict().required(),
    feedback: joi.string().trim().max(1000).allow("").optional(),
  })).min(1).unique("assessmentQuestionId").required(),
});
