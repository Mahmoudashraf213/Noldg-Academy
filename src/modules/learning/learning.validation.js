import joi from "joi";
import { generalFields } from "../../utils/generalFields.js";

export const startPlaybackSchema = joi.object({
  lessonId: generalFields.objectId.required(),
  positionSeconds: joi.number().min(0).optional(),
  playbackRate: joi.number().min(0.25).max(2).default(1),
});

export const playbackSessionParamsSchema = joi.object({
  sessionId: generalFields.objectId.required(),
});

export const playbackHeartbeatSchema = joi.object({
  sequence: joi.number().integer().min(1).max(2147483647).required(),
  positionSeconds: joi.number().min(0).required(),
  playbackRate: joi.number().min(0.25).max(2).required(),
  isPlaying: joi.boolean().required(),
});

// Media links are issued only for the student's currently active playback session.
export const lessonAccessQuerySchema = joi.object({
  sessionId: generalFields.objectId.required(),
});

// A null prerequisite removes the optional restriction without resetting progress.
export const updateWatchRequirementSchema = joi.object({
  prerequisiteLessonId: generalFields.objectId.allow(null).required(),
  requiredWatchPercentage: joi.number().greater(0).max(100).when("prerequisiteLessonId", {
    is: null,
    then: joi.forbidden(),
    otherwise: joi.number().default(100),
  }),
});
