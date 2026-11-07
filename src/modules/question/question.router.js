import { Router } from "express";
import { isAuthenticated } from "../../middleware/authentication.js";
import { isAuthorized } from "../../middleware/autheraization.js";
import { isValid } from "../../middleware/vaildation.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { roles } from "../../utils/constant/enum.js";
import { createQuestion, deleteQuestion, getQuestionById, getQuestions, updateQuestion } from "./question.controller.js";
import {
  createQuestionSchema,
  getMyQuestionsSchema,
  getQuestionsSchema,
  questionIdParamsSchema,
  questionTeacherParamsSchema,
  updateQuestionSchema,
} from "./question.validation.js";

const questionRouter = Router();
const isTeacher = isAuthorized([roles.TEACHER]);
const isAccountManager = isAuthorized([roles.ADMIN, roles.SUPER_ADMIN]);
const canManageQuestions = isAuthorized([roles.TEACHER, roles.ADMIN, roles.SUPER_ADMIN]);

// Teachers manage their own reusable bank; account managers can select any teacher.
questionRouter.post(
  "/",
  isAuthenticated(),
  isTeacher,
  isValid(createQuestionSchema),
  asyncHandler(createQuestion)
);
questionRouter.post(
  "/teachers/:teacherId",
  isAuthenticated(),
  isAccountManager,
  isValid(questionTeacherParamsSchema, "params"),
  isValid(createQuestionSchema),
  asyncHandler(createQuestion)
);
questionRouter.get(
  "/my",
  isAuthenticated(),
  isTeacher,
  isValid(getMyQuestionsSchema, "query"),
  asyncHandler(getQuestions)
);
questionRouter.get(
  "/",
  isAuthenticated(),
  isAccountManager,
  isValid(getQuestionsSchema, "query"),
  asyncHandler(getQuestions)
);
questionRouter.get(
  "/:questionId",
  isAuthenticated(),
  canManageQuestions,
  isValid(questionIdParamsSchema, "params"),
  asyncHandler(getQuestionById)
);
questionRouter.patch(
  "/:questionId",
  isAuthenticated(),
  canManageQuestions,
  isValid(questionIdParamsSchema, "params"),
  isValid(updateQuestionSchema),
  asyncHandler(updateQuestion)
);
questionRouter.delete(
  "/:questionId",
  isAuthenticated(),
  canManageQuestions,
  isValid(questionIdParamsSchema, "params"),
  asyncHandler(deleteQuestion)
);

export default questionRouter;
