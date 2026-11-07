import joi from "joi";
import { generalFields } from "../../utils/generalFields.js";
import { assessmentStatuses, assessmentTypes } from "../../utils/constant/enum.js";

const questionSelection = joi.array().items(joi.object({
  questionId: generalFields.objectId.required(),
  points: joi.number().positive().max(1000000).precision(2).strict().required(),
})).min(1).unique("questionId");
const settings = {
  title: generalFields.name.max(150),
  instructions: joi.string().trim().max(5000).allow(""),
  maxAttempts: joi.number().integer().min(1).max(2147483647),
  durationMinutes: joi.number().integer().min(1).max(2147483647).allow(null),
  opensAt: joi.date().iso().allow(null),
  closesAt: joi.date().iso().allow(null),
  watchLessonId: generalFields.objectId.allow(null),
  requiredWatchPercentage: joi.number().greater(0).max(100),
};

export const createAssessmentSchema = joi.object({
  ...settings,
  title: settings.title.required(),
  courseId: generalFields.objectId.required(),
  type: joi.string().valid(...Object.values(assessmentTypes)).required(),
  lessonId: generalFields.objectId.when("type", {
    is: assessmentTypes.EXAM,
    then: joi.forbidden(),
    otherwise: joi.required(),
  }),
  questions: questionSelection.required(),
});

export const updateAssessmentSchema = joi.object({
  ...settings,
  questions: questionSelection.optional(),
}).min(1);

export const assessmentIdParamsSchema = joi.object({ assessmentId: generalFields.objectId.required() });
export const assessmentCourseParamsSchema = joi.object({ courseId: generalFields.objectId.required() });
export const getAssessmentsSchema = joi.object({
  page: generalFields.page.default(1),
  limit: generalFields.limit.default(20),
  courseId: generalFields.objectId.optional(),
  teacherId: generalFields.objectId.optional(),
  lessonId: generalFields.objectId.optional(),
  type: joi.string().valid(...Object.values(assessmentTypes)).optional(),
  status: joi.string().valid(...Object.values(assessmentStatuses)).optional(),
});
