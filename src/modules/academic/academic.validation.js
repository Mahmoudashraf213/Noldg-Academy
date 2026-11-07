import joi from "joi";
import { generalFields } from "../../utils/generalFields.js";
import { academicStages, academicSystems } from "../../utils/constant/enum.js";

// Validate filters for listing active academic tracks.
export const getTracksSchema = joi.object({
  system: joi.string().valid(...Object.values(academicSystems)).optional(),
  stage: joi.string().valid(...Object.values(academicStages)).optional(),
  isActive: generalFields.isActive.optional(),
});

// Validate a study track defined by a system, stage, and grade.
export const createTrackSchema = joi.object({
  system: joi.string().valid(...Object.values(academicSystems)).required(),
  stage: joi.string().valid(...Object.values(academicStages)).required(),
  grade: joi.number().integer().min(1).max(3).required(),
  name: generalFields.name.required(),
});

// Allow a track's display name or availability to be changed.
export const updateTrackSchema = joi.object({
  name: generalFields.name.optional(),
  isActive: generalFields.isActive.optional(),
}).min(1);

// Validate a track identifier in route parameters.
export const trackIdSchema = joi.object({
  trackId: generalFields.objectId.required(),
});

// Validate filters for listing subjects.
export const getSubjectsSchema = joi.object({
  isActive: generalFields.isActive.optional(),
});

// Validate a subject name.
export const createSubjectSchema = joi.object({
  name: generalFields.name.required(),
});

// Allow a subject's display name or availability to be changed.
export const updateSubjectSchema = joi.object({
  name: generalFields.name.optional(),
  isActive: generalFields.isActive.optional(),
}).min(1);

// Validate a subject identifier in route parameters.
export const subjectIdSchema = joi.object({
  subjectId: generalFields.objectId.required(),
});

// Validate the subject linked to a track.
export const linkSubjectSchema = joi.object({
  subjectId: generalFields.objectId.required(),
});

// Validate both identifiers for removing a track-subject link.
export const trackSubjectParamsSchema = joi.object({
  trackId: generalFields.objectId.required(),
  subjectId: generalFields.objectId.required(),
});
