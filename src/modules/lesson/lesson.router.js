import { Router } from "express";
import { rateLimit } from "../../middleware/rate-limit.js";
import { isAuthenticated } from "../../middleware/authentication.js";
import { isAuthorized } from "../../middleware/autheraization.js";
import { isValid } from "../../middleware/vaildation.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { roles } from "../../utils/constant/enum.js";
import { lessonUploads } from "../../utils/multer-cloud.js";
import {
  createLesson,
  signLessonUpload,
  getCourseLessons,
  updateLesson,
  updateLessonStatus,
} from "./lesson.controller.js";
import { getLessonAccess } from "./lesson-access.controller.js";
import { lessonAccessQuerySchema } from "../learning/learning.validation.js";
import {
  createLessonSchema,
  lessonUploadSchema,
  lessonCourseParamsSchema,
  lessonIdParamsSchema,
  updateLessonSchema,
  updateLessonStatusSchema,
} from "./lesson.validation.js";

const lessonRouter = Router();
const isTeacher = isAuthorized([roles.TEACHER]);
const isStudent = isAuthorized([roles.STUDENT]);

// Sign direct uploads so large lesson files do not pass through the API host.
lessonRouter.post(
  "/courses/:courseId/uploads/sign",
  isAuthenticated(),
  isTeacher,
  isValid(lessonCourseParamsSchema, "params"),
  rateLimit({ scope: "lesson-uploads", limit: 20, windowMs: 900000, key: (req) => req.authUser.id }),
  isValid(lessonUploadSchema),
  asyncHandler(signLessonUpload)
);

// Return lesson media to a student with a valid product entitlement.
lessonRouter.get(
  "/:lessonId/access",
  isAuthenticated(),
  isStudent,
  isValid(lessonIdParamsSchema, "params"),
  isValid(lessonAccessQuerySchema, "query"),
  asyncHandler(getLessonAccess)
);

// List lessons in one of the authenticated teacher's courses.
lessonRouter.get(
  "/courses/:courseId",
  isAuthenticated(),
  isTeacher,
  isValid(lessonCourseParamsSchema, "params"),
  asyncHandler(getCourseLessons)
);

// Create and publish a complete recorded lesson; attachments remain optional.
lessonRouter.post(
  "/courses/:courseId",
  isAuthenticated(),
  isTeacher,
  isValid(lessonCourseParamsSchema, "params"),
  rateLimit({ scope: "lesson-uploads", limit: 20, windowMs: 900000, key: (req) => req.authUser.id }),
  lessonUploads(),
  isValid(createLessonSchema),
  asyncHandler(createLesson)
);

// Update the lesson's content, availability window, video, or attachments.
lessonRouter.patch(
  "/:lessonId",
  isAuthenticated(),
  isTeacher,
  isValid(lessonIdParamsSchema, "params"),
  rateLimit({ scope: "lesson-uploads", limit: 20, windowMs: 900000, key: (req) => req.authUser.id }),
  lessonUploads(),
  isValid(updateLessonSchema),
  asyncHandler(updateLesson)
);

// Let the teacher change the status of an existing lesson.
lessonRouter.patch(
  "/:lessonId/status",
  isAuthenticated(),
  isTeacher,
  isValid(lessonIdParamsSchema, "params"),
  isValid(updateLessonStatusSchema),
  asyncHandler(updateLessonStatus)
);

export default lessonRouter;
