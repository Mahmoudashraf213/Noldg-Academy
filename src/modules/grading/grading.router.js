import { Router } from "express";
import { isAuthenticated } from "../../middleware/authentication.js";
import { isAuthorized } from "../../middleware/autheraization.js";
import { isValid } from "../../middleware/vaildation.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { roles } from "../../utils/constant/enum.js";
import { attemptIdParamsSchema } from "../attempt/attempt.validation.js";
import { gradeAttempt } from "./grading.controller.js";
import { gradeAttemptSchema } from "./grading.validation.js";

const gradingRouter = Router();
gradingRouter.patch(
  "/attempts/:attemptId",
  isAuthenticated(),
  isAuthorized([roles.TEACHER, roles.ADMIN, roles.SUPER_ADMIN]),
  isValid(attemptIdParamsSchema, "params"),
  isValid(gradeAttemptSchema),
  asyncHandler(gradeAttempt)
);
export default gradingRouter;
