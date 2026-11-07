import { Router } from "express";
import { isAuthenticated } from "../../middleware/authentication.js";
import { isAuthorized } from "../../middleware/autheraization.js";
import { isValid } from "../../middleware/vaildation.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { roles } from "../../utils/constant/enum.js";
import {
  createStudyTrack,
  createSubject,
  getAcademicCatalog,
  getSubjects,
  getSubjectsForTrack,
  getStudyTracks,
  linkSubjectToTrack,
  unlinkSubjectFromTrack,
  updateStudyTrack,
  updateSubject,
} from "./academic.controller.js";
import {
  createSubjectSchema,
  createTrackSchema,
  getSubjectsSchema,
  getTracksSchema,
  linkSubjectSchema,
  subjectIdSchema,
  trackIdSchema,
  trackSubjectParamsSchema,
  updateSubjectSchema,
  updateTrackSchema,
} from "./academic.validation.js";

const academicRouter = Router();
const isSuperAdmin = isAuthorized([roles.SUPER_ADMIN]);

// Return the supported systems, stages, and grade levels.
academicRouter.get("/catalog", isAuthenticated(), asyncHandler(getAcademicCatalog));

// List and manage study tracks.
academicRouter.get(
  "/tracks",
  isAuthenticated(),
  isValid(getTracksSchema, "query"),
  asyncHandler(getStudyTracks)
);
academicRouter.post(
  "/tracks",
  isAuthenticated(),
  isSuperAdmin,
  isValid(createTrackSchema),
  asyncHandler(createStudyTrack)
);
academicRouter.patch(
  "/tracks/:trackId",
  isAuthenticated(),
  isSuperAdmin,
  isValid(trackIdSchema, "params"),
  isValid(updateTrackSchema),
  asyncHandler(updateStudyTrack)
);

// List and manage subjects linked to study tracks.
academicRouter.get(
  "/tracks/:trackId/subjects",
  isAuthenticated(),
  isValid(trackIdSchema, "params"),
  asyncHandler(getSubjectsForTrack)
);
academicRouter.post(
  "/tracks/:trackId/subjects",
  isAuthenticated(),
  isSuperAdmin,
  isValid(trackIdSchema, "params"),
  isValid(linkSubjectSchema),
  asyncHandler(linkSubjectToTrack)
);
academicRouter.delete(
  "/tracks/:trackId/subjects/:subjectId",
  isAuthenticated(),
  isSuperAdmin,
  isValid(trackSubjectParamsSchema, "params"),
  asyncHandler(unlinkSubjectFromTrack)
);

// List and manage subjects.
academicRouter.get(
  "/subjects",
  isAuthenticated(),
  isValid(getSubjectsSchema, "query"),
  asyncHandler(getSubjects)
);
academicRouter.post(
  "/subjects",
  isAuthenticated(),
  isSuperAdmin,
  isValid(createSubjectSchema),
  asyncHandler(createSubject)
);
academicRouter.patch(
  "/subjects/:subjectId",
  isAuthenticated(),
  isSuperAdmin,
  isValid(subjectIdSchema, "params"),
  isValid(updateSubjectSchema),
  asyncHandler(updateSubject)
);

export default academicRouter;
