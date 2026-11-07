import { Router } from "express";
import { rateLimit } from "../../middleware/rate-limit.js";
import { isAuthenticated } from "../../middleware/authentication.js";
import { isAuthorized } from "../../middleware/autheraization.js";
import { isValid } from "../../middleware/vaildation.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { roles } from "../../utils/constant/enum.js";
import { cloudUploads } from "../../utils/multer-cloud.js";
import {
  applyAsTeacher,
  getMyTeacherApplication,
  getPublicTeacherProfile,
  getPublicTeachers,
  getTeacherApplications,
  reviewTeacherApplication,
  signupTeacher,
} from "./teacher.controller.js";
import {
  getTeacherApplicationsSchema,
  getTeachersSchema,
  parseTeacherOfferings,
  reviewTeacherApplicationSchema,
  teacherApplicationIdSchema,
  teacherApplicationSchema,
  teacherIdSchema,
  teacherSignupSchema,
  updateTeacherProfileSchema,
} from "./teacher.validation.js";
import { updateMyTeacherProfile } from "./teacher.controller.js";

const teacherRouter = Router();
const isAccountManager = isAuthorized([roles.ADMIN, roles.SUPER_ADMIN]);

// Applicants can sign up directly as teachers and submit their teaching profile.
teacherRouter.post(
  "/signup",
  rateLimit({ scope: "teacher-registration", limit: 5, windowMs: 3600000 }),
  cloudUploads().single("image"),
  parseTeacherOfferings,
  isValid(teacherSignupSchema),
  asyncHandler(signupTeacher)
);

// Rejected teachers can update and resubmit their application.
teacherRouter.post(
  "/applications",
  isAuthenticated(),
  isAuthorized([roles.TEACHER]),
  rateLimit({ scope: "teacher-images", limit: 20, windowMs: 900000, key: (req) => req.authUser.id }),
  cloudUploads().single("image"),
  parseTeacherOfferings,
  isValid(teacherApplicationSchema),
  asyncHandler(applyAsTeacher)
);

// Applicants and teachers can check their current application.
teacherRouter.get(
  "/me/application",
  isAuthenticated(),
  isAuthorized([roles.STUDENT, roles.TEACHER]),
  asyncHandler(getMyTeacherApplication)
);

// Let applicants and approved teachers update their profile and teaching declarations.
teacherRouter.patch(
  "/me/profile",
  isAuthenticated(),
  isAuthorized([roles.STUDENT, roles.TEACHER]),
  rateLimit({ scope: "teacher-images", limit: 20, windowMs: 900000, key: (req) => req.authUser.id }),
  cloudUploads().single("image"),
  parseTeacherOfferings,
  isValid(updateTeacherProfileSchema),
  asyncHandler(updateMyTeacherProfile)
);

// Account managers can review teacher applications.
teacherRouter.get(
  "/applications",
  isAuthenticated(),
  isAccountManager,
  isValid(getTeacherApplicationsSchema, "query"),
  asyncHandler(getTeacherApplications)
);
teacherRouter.patch(
  "/applications/:applicationId/review",
  isAuthenticated(),
  isAccountManager,
  isValid(teacherApplicationIdSchema, "params"),
  isValid(reviewTeacherApplicationSchema),
  asyncHandler(reviewTeacherApplication)
);

// Publicly list and view approved teachers.
teacherRouter.get(
  "/",
  isValid(getTeachersSchema, "query"),
  asyncHandler(getPublicTeachers)
);
teacherRouter.get(
  "/:teacherId",
  isValid(teacherIdSchema, "params"),
  asyncHandler(getPublicTeacherProfile)
);

export default teacherRouter;
