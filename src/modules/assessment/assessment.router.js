import { Router } from "express";
import { isAuthenticated } from "../../middleware/authentication.js";
import { isAuthorized } from "../../middleware/autheraization.js";
import { isValid } from "../../middleware/vaildation.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { roles } from "../../utils/constant/enum.js";
import { getMyLatestAttempt } from "../attempt/attempt.controller.js";
import { closeAssessment, createAssessment, getAssessmentById, getAssessments, getCourseAssessments, publishAssessment, updateAssessment } from "./assessment.controller.js";
import { assessmentCourseParamsSchema, assessmentIdParamsSchema, createAssessmentSchema, getAssessmentsSchema, updateAssessmentSchema } from "./assessment.validation.js";

const assessmentRouter = Router();
const isManager = isAuthorized([roles.TEACHER, roles.ADMIN, roles.SUPER_ADMIN]);
const canView = isAuthorized([roles.STUDENT, roles.TEACHER, roles.ADMIN, roles.SUPER_ADMIN]);
assessmentRouter.post(
  "/",
  isAuthenticated(),
  isManager,
  isValid(createAssessmentSchema),
  asyncHandler(createAssessment)
);
assessmentRouter.get(
  "/my",
  isAuthenticated(),
  isAuthorized([roles.TEACHER]),
  isValid(getAssessmentsSchema, "query"),
  asyncHandler(getAssessments)
);
assessmentRouter.get(
  "/",
  isAuthenticated(),
  isAuthorized([roles.ADMIN, roles.SUPER_ADMIN]),
  isValid(getAssessmentsSchema, "query"),
  asyncHandler(getAssessments)
);
assessmentRouter.get(
  "/courses/:courseId",
  isAuthenticated(),
  canView,
  isValid(assessmentCourseParamsSchema, "params"),
  asyncHandler(getCourseAssessments)
);
assessmentRouter.get(
  "/:assessmentId/my-attempt",
  isAuthenticated(),
  isAuthorized([roles.STUDENT]),
  isValid(assessmentIdParamsSchema, "params"),
  asyncHandler(getMyLatestAttempt)
);
assessmentRouter.get(
  "/:assessmentId",
  isAuthenticated(),
  canView,
  isValid(assessmentIdParamsSchema, "params"),
  asyncHandler(getAssessmentById)
);
assessmentRouter.patch(
  "/:assessmentId",
  isAuthenticated(),
  isManager,
  isValid(assessmentIdParamsSchema, "params"),
  isValid(updateAssessmentSchema),
  asyncHandler(updateAssessment)
);
assessmentRouter.patch(
  "/:assessmentId/publish",
  isAuthenticated(),
  isManager,
  isValid(assessmentIdParamsSchema, "params"),
  asyncHandler(publishAssessment)
);
assessmentRouter.patch(
  "/:assessmentId/close",
  isAuthenticated(),
  isManager,
  isValid(assessmentIdParamsSchema, "params"),
  asyncHandler(closeAssessment)
);
export default assessmentRouter;
