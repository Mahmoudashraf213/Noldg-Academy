import { AppError } from "../../utils/appError.js";
import { messages } from "../../utils/constant/messages.js";
import {
  academicStages,
  academicSystems,
} from "../../utils/constant/enum.js";
import { StudyTrack, Subject, TrackSubject } from "../../../db/index.js";

// Return the fixed systems, stages, and grade levels supported by the platform.
export const getAcademicCatalog = async (req, res) => {
  return res.status(200).json({
    message: messages.academic.fetchedSuccessfully,
    success: true,
    data: {
      systems: Object.values(academicSystems),
      stages: Object.values(academicStages),
      grades: [1, 2, 3],
    },
  });
};

// List active study tracks, optionally filtered by system or stage.
export const getStudyTracks = async (req, res) => {
  const { system, stage, isActive } = req.validatedQuery;
  const tracks = await StudyTrack.findMany({
    where: {
      isActive: isActive ?? true,
      ...(system && { system }),
      ...(stage && { stage }),
    },
    orderBy: [{ system: "asc" }, { stage: "asc" }, { grade: "asc" }],
  });

  return res.status(200).json({
    message: messages.academic.fetchedSuccessfully,
    success: true,
    count: tracks.length,
    data: tracks,
  });
};

// Create a study track from its system, stage, and grade.
export const createStudyTrack = async (req, res, next) => {
  const { system, stage, grade, name } = req.body;

  if (
    system === academicSystems.AMERICAN_DIPLOMA &&
    stage !== academicStages.SECONDARY
  ) {
    return next(new AppError(messages.academic.americanSecondaryOnly, 400));
  }

  const trackExists = await StudyTrack.findFirst({
    where: { system, stage, grade },
  });
  if (trackExists) {
    return next(new AppError(messages.academic.trackAlreadyExists, 409));
  }

  const track = await StudyTrack.create({
    data: { system, stage, grade, name },
  });

  return res.status(201).json({
    message: messages.academic.created,
    success: true,
    data: track,
  });
};

// Update a study track's display name or availability.
export const updateStudyTrack = async (req, res, next) => {
  const { trackId } = req.validatedParams;
  const update = await StudyTrack.updateMany({
    where: { id: trackId },
    data: req.body,
  });

  if (!update.count) {
    return next(new AppError(messages.academic.trackNotExist, 404));
  }

  const track = await StudyTrack.findUnique({ where: { id: trackId } });
  return res.status(200).json({
    message: messages.academic.updated,
    success: true,
    data: track,
  });
};

// List active subjects, or inactive subjects when explicitly requested.
export const getSubjects = async (req, res) => {
  const { isActive } = req.validatedQuery;
  const subjects = await Subject.findMany({
    where: { isActive: isActive ?? true },
    orderBy: { name: "asc" },
  });

  return res.status(200).json({
    message: messages.academic.fetchedSuccessfully,
    success: true,
    count: subjects.length,
    data: subjects,
  });
};

// Create a subject that can be linked to study tracks.
export const createSubject = async (req, res) => {
  const subject = await Subject.create({ data: { name: req.body.name } });

  return res.status(201).json({
    message: messages.academic.created,
    success: true,
    data: subject,
  });
};

// Update a subject's display name or availability.
export const updateSubject = async (req, res, next) => {
  const { subjectId } = req.validatedParams;
  const update = await Subject.updateMany({
    where: { id: subjectId },
    data: req.body,
  });

  if (!update.count) {
    return next(new AppError(messages.academic.subjectNotExist, 404));
  }

  const subject = await Subject.findUnique({ where: { id: subjectId } });
  return res.status(200).json({
    message: messages.academic.updated,
    success: true,
    data: subject,
  });
};

// Link an active subject to an active study track.
export const linkSubjectToTrack = async (req, res, next) => {
  const { trackId } = req.validatedParams;
  const { subjectId } = req.body;
  const [track, subject] = await Promise.all([
    StudyTrack.findFirst({ where: { id: trackId, isActive: true } }),
    Subject.findFirst({ where: { id: subjectId, isActive: true } }),
  ]);

  if (!track) {
    return next(new AppError(messages.academic.trackNotExist, 404));
  }
  if (!subject) {
    return next(new AppError(messages.academic.subjectNotExist, 404));
  }

  const linkExists = await TrackSubject.findFirst({
    where: { trackId, subjectId },
  });
  if (linkExists) {
    return next(new AppError(messages.academic.trackSubjectAlreadyExists, 409));
  }

  const link = await TrackSubject.create({ data: { trackId, subjectId } });

  return res.status(201).json({
    message: messages.academic.created,
    success: true,
    data: link,
  });
};

// List active subjects linked to a study track.
export const getSubjectsForTrack = async (req, res, next) => {
  const { trackId } = req.validatedParams;
  const track = await StudyTrack.findFirst({
    where: { id: trackId, isActive: true },
  });

  if (!track) {
    return next(new AppError(messages.academic.trackNotExist, 404));
  }

  const links = await TrackSubject.findMany({
    where: { trackId, subject: { isActive: true } },
    include: { subject: true },
    orderBy: { createdAt: "asc" },
  });
  const subjects = links.map(({ subject }) => subject);

  return res.status(200).json({
    message: messages.academic.fetchedSuccessfully,
    success: true,
    count: subjects.length,
    data: subjects,
  });
};

// Remove a subject-to-track link without deleting either catalog record.
export const unlinkSubjectFromTrack = async (req, res, next) => {
  const { trackId, subjectId } = req.validatedParams;
  const deletion = await TrackSubject.deleteMany({ where: { trackId, subjectId } });

  if (!deletion.count) {
    return next(new AppError(messages.academic.trackSubjectNotExist, 404));
  }

  return res.status(200).json({
    message: messages.academic.deleted,
    success: true,
  });
};
