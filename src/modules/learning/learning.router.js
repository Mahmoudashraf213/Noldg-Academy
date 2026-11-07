import { Router } from "express";
import { isAuthenticated } from "../../middleware/authentication.js";
import { isAuthorized } from "../../middleware/autheraization.js";
import { isValid } from "../../middleware/vaildation.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { roles } from "../../utils/constant/enum.js";
import { lessonIdParamsSchema } from "../lesson/lesson.validation.js";
import { closePlaybackSession, getLessonProgress, savePlaybackHeartbeat, startPlaybackSession, updateWatchRequirement } from "./learning.controller.js";
import { playbackHeartbeatSchema, playbackSessionParamsSchema, startPlaybackSchema, updateWatchRequirementSchema } from "./learning.validation.js";

const learningRouter = Router();
const isStudent = isAuthorized([roles.STUDENT]);

learningRouter.post(
  "/playback-sessions",
  isAuthenticated(),
  isStudent,
  isValid(startPlaybackSchema),
  asyncHandler(startPlaybackSession)
);
learningRouter.patch(
  "/playback-sessions/:sessionId/heartbeat",
  isAuthenticated(),
  isStudent,
  isValid(playbackSessionParamsSchema, "params"),
  isValid(playbackHeartbeatSchema),
  asyncHandler(savePlaybackHeartbeat)
);
learningRouter.patch(
  "/playback-sessions/:sessionId/close",
  isAuthenticated(),
  isStudent,
  isValid(playbackSessionParamsSchema, "params"),
  asyncHandler(closePlaybackSession)
);
learningRouter.get(
  "/lessons/:lessonId/progress",
  isAuthenticated(),
  isStudent,
  isValid(lessonIdParamsSchema, "params"),
  asyncHandler(getLessonProgress)
);
learningRouter.patch(
  "/lessons/:lessonId/watch-requirement",
  isAuthenticated(),
  isAuthorized([roles.TEACHER, roles.ADMIN, roles.SUPER_ADMIN]),
  isValid(lessonIdParamsSchema, "params"),
  isValid(updateWatchRequirementSchema),
  asyncHandler(updateWatchRequirement)
);

export default learningRouter;
