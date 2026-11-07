import { AppError } from "../../utils/appError.js";
import { messages } from "../../utils/constant/messages.js";
import { Lesson } from "../../../db/index.js";
import cloudinary from "../../utils/cloud.js";
import { assertLessonPlaybackAccess, getActivePlaybackSession } from "../learning/learning.utils.js";

const mediaLinkLifetimeSeconds = 60 * 60;

// Create a short-lived Cloudinary URL for a protected lesson asset.
const createLessonMediaUrl = (asset, resourceType, attachment = false, expiresAt) =>
  cloudinary.utils.private_download_url(asset.publicId, asset.format, {
    resource_type: resourceType,
    type: "authenticated",
    expires_at: Math.min(Math.floor(Date.now() / 1000) + mediaLinkLifetimeSeconds, Math.floor(expiresAt.getTime() / 1000)),
    attachment,
  });

// Return lesson media when it is free or the student has paid or complimentary access.
export const getLessonAccess = async (req, res, next) => {
  const lesson = await Lesson.findUnique({
    where: { id: req.validatedParams.lessonId },
  });

  if (!lesson) {
    return next(new AppError(messages.lesson.notFound, 404));
  }

  await assertLessonPlaybackAccess(req.authUser, lesson);
  const session = await getActivePlaybackSession(req.authUser, req.validatedQuery.sessionId);
  if (session.lessonId !== lesson.id || session.videoPublicId !== lesson.video.publicId || session.durationSeconds !== Number(lesson.video.duration)) {
    return next(new AppError(messages.learning.videoChanged, 409));
  }

  return res.status(200).json({
    message: messages.lesson.accessGranted,
    success: true,
    data: {
      _id: lesson.id,
      playbackSessionId: session.id,
      mediaExpiresAt: new Date(Math.min(session.expiresAt.getTime(), lesson.availableUntil.getTime())),
      courseId: lesson.courseId,
      title: lesson.title,
      description: lesson.description,
      type: lesson.type,
      isFree: lesson.isFree,
      availableFrom: lesson.availableFrom,
      availableUntil: lesson.availableUntil,
      video: lesson.video
        ? {
            url: createLessonMediaUrl(lesson.video, "video", false, new Date(Math.min(session.expiresAt.getTime(), lesson.availableUntil.getTime()))),
            duration: lesson.video.duration,
          }
        : null,
      attachments: lesson.attachments.map((attachment) => ({
        name: attachment.name,
        url: createLessonMediaUrl(attachment, "raw", true, new Date(Math.min(session.expiresAt.getTime(), lesson.availableUntil.getTime()))),
      })),
    },
  });
};
