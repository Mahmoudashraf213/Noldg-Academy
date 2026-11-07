import { Prisma } from "@prisma/client";
import { Lesson, LessonProgress, PlaybackSession, prisma } from "../../../db/index.js";
import { AppError } from "../../utils/appError.js";
import { messages } from "../../utils/constant/messages.js";
import { roles, teacherApprovalStatuses } from "../../utils/constant/enum.js";
import {
  assertLessonPlaybackAccess,
  formatLessonProgress,
  getActivePlaybackSession,
  getWatchRequirement,
  heartbeatIntervalSeconds,
  maximumHeartbeatGapSeconds,
  mergeWatchedRanges,
  playbackLeaseMs,
} from "./learning.utils.js";

// Start only an eligible video before replacing the student's previous session.
export const startPlaybackSession = async (req, res) => {
  const result = await prisma.$transaction(async (transaction) => {
    const now = new Date();
    const lesson = await transaction.lesson.findUnique({ where: { id: req.body.lessonId } });
    await assertLessonPlaybackAccess(req.authUser, lesson, transaction, now);
    const duration = Number(lesson.video.duration);
    const key = { studentId: req.authUser.id, lessonId: lesson.id, videoPublicId: lesson.video.publicId };
    let progress = await transaction.lessonProgress.upsert({
      where: { studentId_lessonId_videoPublicId: key },
      update: {},
      create: { ...key, durationSeconds: duration },
    });
    if (progress.durationSeconds !== duration) {
      progress = await transaction.lessonProgress.update({
        where: { id: progress.id },
        data: { durationSeconds: duration, watchedRanges: [], watchedSeconds: 0, lastPosition: 0 },
      });
    }
    const position = req.body.positionSeconds ?? Math.min(progress.lastPosition, duration);
    if (position > duration) throw new AppError(messages.learning.positionInvalid, 400);
    await transaction.playbackSession.updateMany({
      where: { studentId: req.authUser.id, status: "active" },
      data: { status: "closed", closedAt: now },
    });
    const session = await transaction.playbackSession.create({
      data: {
        ...key,
        durationSeconds: duration,
        authSessionVersion: req.authUser.sessionVersion,
        deviceId: req.authUser.activeDeviceId,
        lastPosition: position,
        playbackRate: req.body.playbackRate,
        lastHeartbeatAt: now,
        expiresAt: new Date(now.getTime() + playbackLeaseMs),
      },
    });
    return { session, progress: formatLessonProgress(progress, lesson) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return res.status(201).json({
    message: messages.learning.sessionStarted,
    success: true,
    data: { ...result, heartbeatIntervalSeconds, maximumHeartbeatGapSeconds },
  });
};

// Credit plausible continuous playback once, using server time rather than client duration claims.
export const savePlaybackHeartbeat = async (req, res) => {
  const { sequence, positionSeconds, playbackRate, isPlaying } = req.body;
  const result = await prisma.$transaction(async (transaction) => {
    const now = new Date();
    const session = await getActivePlaybackSession(req.authUser, req.validatedParams.sessionId, transaction, now);
    if (sequence !== session.lastSequence + 1) throw new AppError(messages.learning.sequenceConflict, 409);
    const elapsed = (now - session.lastHeartbeatAt) / 1000;
    if (elapsed < 3) throw new AppError(messages.learning.heartbeatTooSoon, 429);
    const lesson = await transaction.lesson.findUnique({ where: { id: session.lessonId } });
    await assertLessonPlaybackAccess(req.authUser, lesson, transaction, now);
    if (lesson.video.publicId !== session.videoPublicId || Number(lesson.video.duration) !== session.durationSeconds) {
      throw new AppError(messages.learning.videoChanged, 409);
    }
    if (positionSeconds > session.durationSeconds) throw new AppError(messages.learning.positionInvalid, 400);
    const delta = positionSeconds - session.lastPosition;
    const budget = session.timeBudgetSeconds + elapsed * session.playbackRate;
    const continuous = session.isPlaying && playbackRate === session.playbackRate && elapsed <= maximumHeartbeatGapSeconds
      && delta > 0 && delta <= budget + 0.25;
    const timeBudgetSeconds = continuous ? Math.max(-0.25, Math.min(0.25, budget - delta)) : 0;
    const update = await transaction.playbackSession.updateMany({
      where: { id: session.id, status: "active", lastSequence: session.lastSequence },
      data: {
        lastSequence: sequence,
        lastPosition: positionSeconds,
        playbackRate,
        isPlaying,
        timeBudgetSeconds,
        lastHeartbeatAt: now,
        expiresAt: new Date(now.getTime() + playbackLeaseMs),
      },
    });
    if (!update.count) throw new AppError(messages.learning.sequenceConflict, 409);
    const where = { studentId_lessonId_videoPublicId: { studentId: req.authUser.id, lessonId: lesson.id, videoPublicId: session.videoPublicId } };
    const progress = await transaction.lessonProgress.findUnique({ where });
    const ranges = continuous
      ? mergeWatchedRanges(progress.watchedRanges, session.lastPosition, positionSeconds, session.durationSeconds)
      : progress.watchedRanges;
    const watchedSeconds = Math.min(session.durationSeconds, ranges.reduce((total, [from, to]) => total + to - from, 0));
    const saved = await transaction.lessonProgress.update({
      where,
      data: { watchedRanges: ranges, watchedSeconds, lastPosition: positionSeconds },
    });
    return {
      sessionId: session.id,
      sequence,
      creditedSeconds: Number(Math.max(0, watchedSeconds - progress.watchedSeconds).toFixed(3)),
      expiresAt: new Date(now.getTime() + playbackLeaseMs),
      progress: formatLessonProgress(saved, lesson),
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return res.status(200).json({ message: messages.learning.heartbeatSaved, success: true, data: result });
};

export const closePlaybackSession = async (req, res, next) => {
  const closed = await PlaybackSession.updateMany({
    where: { id: req.validatedParams.sessionId, studentId: req.authUser.id, authSessionVersion: req.authUser.sessionVersion, status: "active" },
    data: { status: "closed", closedAt: new Date() },
  });
  if (!closed.count) return next(new AppError(messages.learning.sessionNotActive, 409));
  return res.status(200).json({ message: messages.learning.sessionClosed, success: true });
};

// Students can inspect their progress and the optional gate without needing a running session.
export const getLessonProgress = async (req, res, next) => {
  const lesson = await Lesson.findUnique({ where: { id: req.validatedParams.lessonId } });
  if (!lesson) return next(new AppError(messages.lesson.notFound, 404));
  const progress = lesson.video?.publicId
    ? await LessonProgress.findUnique({
        where: { studentId_lessonId_videoPublicId: { studentId: req.authUser.id, lessonId: lesson.id, videoPublicId: lesson.video.publicId } },
      })
    : null;
  return res.status(200).json({
    message: messages.learning.progressFetched,
    success: true,
    data: { ...formatLessonProgress(progress?.durationSeconds === Number(lesson.video?.duration) ? progress : null, lesson), requirement: await getWatchRequirement(req.authUser.id, lesson) },
  });
};

// Teachers edit only their own course; account managers may edit any optional gate.
export const updateWatchRequirement = async (req, res) => {
  const lesson = await prisma.$transaction(async (transaction) => {
    const lesson = await transaction.lesson.findUnique({
      where: { id: req.validatedParams.lessonId },
      include: { course: { select: { teacherId: true } } },
    });
    if (!lesson) throw new AppError(messages.lesson.notFound, 404);
    if (req.authUser.roles === roles.TEACHER && lesson.course.teacherId !== req.authUser.id) {
      throw new AppError(messages.user.unauthorized, 403);
    }
    if (req.authUser.roles === roles.TEACHER) {
      const profile = await transaction.teacherProfile.findFirst({
        where: { userId: req.authUser.id, approvalStatus: teacherApprovalStatuses.APPROVED },
        select: { id: true },
      });
      if (!profile) throw new AppError(messages.lesson.teacherApprovalRequired, 403);
    }
    let prerequisiteId = req.body.prerequisiteLessonId;
    const visited = new Set([lesson.id]);
    while (prerequisiteId) {
      if (visited.has(prerequisiteId)) throw new AppError(messages.learning.prerequisiteCycle, 400);
      visited.add(prerequisiteId);
      const prerequisite = await transaction.lesson.findUnique({ where: { id: prerequisiteId } });
      if (!prerequisite || prerequisite.courseId !== lesson.courseId || !prerequisite.video?.publicId || !Number.isFinite(Number(prerequisite.video.duration)) || !(Number(prerequisite.video.duration) > 0)) {
        throw new AppError(messages.learning.prerequisiteInvalid, 400);
      }
      prerequisiteId = prerequisite.prerequisiteLessonId;
    }
    return transaction.lesson.update({
      where: { id: lesson.id },
      data: { prerequisiteLessonId: req.body.prerequisiteLessonId, requiredWatchPercentage: req.body.requiredWatchPercentage ?? 100 },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return res.status(200).json({ message: messages.learning.requirementUpdated, success: true, data: lesson });
};
