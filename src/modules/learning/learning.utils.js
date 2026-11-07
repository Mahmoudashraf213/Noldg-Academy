import { prisma } from "../../../db/index.js";
import { AppError } from "../../utils/appError.js";
import { messages } from "../../utils/constant/messages.js";
import { hasLessonAccess } from "../lesson/lesson-access.utils.js";

export const playbackLeaseMs = 120000;
export const heartbeatIntervalSeconds = 10;
export const maximumHeartbeatGapSeconds = 30;

// Merge continuous viewed intervals so replayed seconds never increase completion.
export const mergeWatchedRanges = (ranges, start, end, duration) => {
  const sorted = [...ranges, [Math.max(0, start), Math.min(duration, end)]]
    .filter(([from, to]) => to > from)
    .sort((left, right) => left[0] - right[0]);
  const merged = [];
  for (const [from, to] of sorted) {
    const last = merged[merged.length - 1];
    if (last && from <= last[1] + 0.000001) last[1] = Math.max(last[1], to);
    else merged.push([from, to]);
  }
  return merged;
};

export const formatLessonProgress = (progress, lesson) => {
  const durationSeconds = Number(lesson.video?.duration) || 0;
  const watchedSeconds = progress?.watchedSeconds ?? 0;
  return {
    lessonId: lesson.id,
    durationSeconds,
    watchedSeconds: Number(watchedSeconds.toFixed(3)),
    watchedPercentage: durationSeconds > 0
      ? Number(Math.min(100, watchedSeconds / durationSeconds * 100).toFixed(2))
      : 0,
    lastPosition: progress?.lastPosition ?? 0,
    watchedRanges: progress?.watchedRanges ?? [],
    completed: durationSeconds > 0 && watchedSeconds + 0.01 >= durationSeconds,
  };
};

// Requirements follow the prerequisite's current video, not a replaced recording.
export const getWatchRequirement = async (studentId, lesson, transaction = prisma) => {
  if (!lesson.prerequisiteLessonId) return { isMet: true, prerequisiteLessonId: null };
  const prerequisite = await transaction.lesson.findUnique({ where: { id: lesson.prerequisiteLessonId } });
  const duration = Number(prerequisite?.video?.duration);
  const progress = prerequisite?.video?.publicId
    ? await transaction.lessonProgress.findUnique({
        where: { studentId_lessonId_videoPublicId: { studentId, lessonId: prerequisite.id, videoPublicId: prerequisite.video.publicId } },
      })
    : null;
  const watched = progress?.durationSeconds === duration ? progress.watchedSeconds : 0;
  return {
    prerequisiteLessonId: lesson.prerequisiteLessonId,
    requiredWatchPercentage: lesson.requiredWatchPercentage,
    watchedPercentage: duration > 0 ? Number(Math.min(100, watched / duration * 100).toFixed(2)) : 0,
    isMet: Number.isFinite(duration) && duration > 0 && watched + 0.01 >= duration * lesson.requiredWatchPercentage / 100,
  };
};

export const assertLessonPlaybackAccess = async (authUser, lesson, transaction = prisma, now = new Date()) => {
  if (!lesson) throw new AppError(messages.lesson.notFound, 404);
  if (!(await hasLessonAccess(authUser.id, lesson, now, transaction))) {
    throw new AppError(messages.lesson.accessDenied, 403);
  }
  const requirement = await getWatchRequirement(authUser.id, lesson, transaction);
  if (!requirement.isMet) {
    throw new AppError(messages.learning.prerequisiteRequired(lesson.requiredWatchPercentage), 403);
  }
  const duration = Number(lesson.video?.duration);
  if (!lesson.video?.publicId || !Number.isFinite(duration) || duration <= 0) {
    throw new AppError(messages.learning.videoUnavailable, 409);
  }
};

// Bind playback to the authenticated login, device, lease, and current video.
export const getActivePlaybackSession = async (authUser, sessionId, transaction = prisma, now = new Date()) => {
  const session = await transaction.playbackSession.findFirst({
    where: {
      id: sessionId,
      studentId: authUser.id,
      authSessionVersion: authUser.sessionVersion,
      deviceId: authUser.activeDeviceId,
      status: "active",
      expiresAt: { gt: now },
    },
  });
  if (!session) throw new AppError(messages.learning.sessionNotActive, 409);
  return session;
};
