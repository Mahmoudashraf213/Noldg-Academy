import joi from "joi";
import { generalFields } from "../../utils/generalFields.js";
import { attemptStatuses, questionTypes } from "../../utils/constant/enum.js";

const answers = joi.array().items(joi.object({
  assessmentQuestionId: generalFields.objectId.required(),
  answer: joi.any().allow(null).required(),
})).min(1).unique("assessmentQuestionId");
const sequence = joi.number().integer().min(1).max(2147483647);
export const startAttemptSchema = joi.object({ assessmentId: generalFields.objectId.required() });
export const attemptIdParamsSchema = joi.object({ attemptId: generalFields.objectId.required() });
export const saveAttemptAnswersSchema = joi.object({ sequence: sequence.required(), answers: answers.required() });
export const submitAttemptSchema = joi.object({ sequence: sequence.optional(), answers: answers.optional() }).and("sequence", "answers");
export const getAttemptsSchema = joi.object({
  assessmentId: generalFields.objectId.required(),
  studentId: generalFields.objectId.optional(),
  status: joi.string().valid(...Object.values(attemptStatuses)).optional(),
  page: generalFields.page.default(1),
  limit: generalFields.limit.default(20),
});

// Validate answers against the saved assessment snapshot, never the mutable question bank.
export const validateAttemptAnswer = (question, answer) => {
  if (answer === null) return { value: null };
  const index = joi.number().integer().min(0).max(question.options.length - 1);
  const schemas = {
    [questionTypes.SINGLE_CHOICE]: index,
    [questionTypes.MULTIPLE_CHOICE]: joi.array().items(index).unique(),
    [questionTypes.TRUE_FALSE]: joi.boolean(),
    [questionTypes.ESSAY]: joi.string().trim().max(20000).allow(""),
  };
  return schemas[question.type].validate(answer, { abortEarly: false });
};
