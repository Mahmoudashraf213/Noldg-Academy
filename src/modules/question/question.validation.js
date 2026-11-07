import joi from "joi";
import { generalFields } from "../../utils/generalFields.js";
import { questionTypes } from "../../utils/constant/enum.js";

const option = joi.string().trim().max(1000);
const answerIndex = joi.number().integer().min(0);
const correctAnswer = joi.alternatives().try(
  answerIndex,
  joi.array().items(answerIndex).min(1).unique(),
  joi.boolean()
);

// Correct choice indexes refer to the zero-based positions of the supplied options.
const validateAnswer = (value, helpers) => {
  if (value.type === questionTypes.SINGLE_CHOICE && value.correctAnswer >= value.options.length) {
    return helpers.error("any.invalid");
  }
  if (value.type === questionTypes.MULTIPLE_CHOICE && value.correctAnswer.some((index) => index >= value.options.length)) {
    return helpers.error("any.invalid");
  }
  return value;
};

// Keep essays text-only while requiring an answer key for objective questions.
export const createQuestionSchema = joi.object({
  text: joi.string().trim().max(5000).required(),
  type: joi.string().valid(...Object.values(questionTypes)).required(),
  options: joi.array().items(option).min(2).unique().when("type", {
    is: joi.valid(questionTypes.SINGLE_CHOICE, questionTypes.MULTIPLE_CHOICE),
    then: joi.required(),
    otherwise: joi.forbidden(),
  }),
  correctAnswer: joi.when("type", {
    switch: [
      { is: questionTypes.SINGLE_CHOICE, then: answerIndex.required() },
      { is: questionTypes.MULTIPLE_CHOICE, then: joi.array().items(answerIndex).min(1).unique().required() },
      { is: questionTypes.TRUE_FALSE, then: joi.boolean().required() },
    ],
    otherwise: joi.forbidden(),
  }),
}).custom(validateAnswer);

// The controller checks the merged question so partial edits cannot invalidate an answer.
export const updateQuestionSchema = joi.object({
  text: joi.string().trim().max(5000).optional(),
  type: joi.string().valid(...Object.values(questionTypes)).optional(),
  options: joi.array().items(option).min(2).unique().optional(),
  correctAnswer: correctAnswer.optional(),
}).min(1);

export const questionIdParamsSchema = joi.object({
  questionId: generalFields.objectId.required(),
});

export const questionTeacherParamsSchema = joi.object({
  teacherId: generalFields.objectId.required(),
});

export const getMyQuestionsSchema = joi.object({
  page: generalFields.page.default(1),
  limit: generalFields.limit.default(20),
  type: joi.string().valid(...Object.values(questionTypes)).optional(),
});

export const getQuestionsSchema = getMyQuestionsSchema.keys({
  teacherId: generalFields.objectId.optional(),
});
