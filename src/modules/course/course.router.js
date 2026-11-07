import { Router } from "express";
import { isAuthenticated } from "../../middleware/authentication.js";
import { isAuthorized } from "../../middleware/autheraization.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { roles } from "../../utils/constant/enum.js";
import { getCourseStudents, getMyCourses } from "./course.controller.js";
import { courseIdParamsSchema } from "./course.validation.js";
import { isValid } from "../../middleware/vaildation.js";

const courseRouter = Router();

// Let a teacher view courses created from their declared offerings.
courseRouter.get(
  "/my",
  isAuthenticated(),
  isAuthorized([roles.TEACHER]),
  asyncHandler(getMyCourses)
);

// Let an approved teacher view students with a product entitlement in a course.
courseRouter.get(
  "/:courseId/students",
  isAuthenticated(),
  isAuthorized([roles.TEACHER]),
  isValid(courseIdParamsSchema, "params"),
  asyncHandler(getCourseStudents)
);

export default courseRouter;
