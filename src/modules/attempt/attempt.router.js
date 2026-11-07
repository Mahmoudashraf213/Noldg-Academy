import { Router } from "express";
import { isAuthenticated } from "../../middleware/authentication.js";
import { isAuthorized } from "../../middleware/autheraization.js";
import { isValid } from "../../middleware/vaildation.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { roles } from "../../utils/constant/enum.js";
import { getAttemptById, getAttempts, saveAnswers, startAttempt, submitAttempt } from "./attempt.controller.js";
import { attemptIdParamsSchema, getAttemptsSchema, saveAttemptAnswersSchema, startAttemptSchema, submitAttemptSchema } from "./attempt.validation.js";

const attemptRouter = Router();
const isStudent = isAuthorized([roles.STUDENT]);
attemptRouter.post(
  "/",
  isAuthenticated(),
  isStudent,
  isValid(startAttemptSchema),
  asyncHandler(startAttempt)
);
attemptRouter.get(
  "/",
  isAuthenticated(),
  isAuthorized([roles.TEACHER, roles.ADMIN, roles.SUPER_ADMIN]),
  isValid(getAttemptsSchema, "query"),
  asyncHandler(getAttempts)
);
attemptRouter.get(
  "/:attemptId",
  isAuthenticated(),
  isAuthorized([roles.STUDENT, roles.TEACHER, roles.ADMIN, roles.SUPER_ADMIN]),
  isValid(attemptIdParamsSchema, "params"),
  asyncHandler(getAttemptById)
);
attemptRouter.patch(
  "/:attemptId/answers",
  isAuthenticated(),
  isStudent,
  isValid(attemptIdParamsSchema, "params"),
  isValid(saveAttemptAnswersSchema),
  asyncHandler(saveAnswers)
);
attemptRouter.post(
  "/:attemptId/submit",
  isAuthenticated(),
  isStudent,
  isValid(attemptIdParamsSchema, "params"),
  isValid(submitAttemptSchema),
  asyncHandler(submitAttempt)
);
export default attemptRouter;
