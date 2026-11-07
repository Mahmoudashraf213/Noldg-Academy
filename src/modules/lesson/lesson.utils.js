import path from "path";
import { Prisma } from "@prisma/client";
import { Lesson, prisma } from "../../../db/index.js";
import { queueMediaCleanup } from "../../utils/media-cleanup.js";
import cloudinary from "../../utils/cloud.js";
import { deleteFile } from "../../utils/file-functions.js";
import { lessonStatuses } from "../../utils/constant/enum.js";
import { messages } from "../../utils/constant/messages.js";

const videoRetentionMs = 30 * 24 * 60 * 60 * 1000;

// Calculate lesson availability from its saved time window and the current server time.
export const isLessonAvailableAt = (lesson, now = new Date()) =>
  lesson.status === lessonStatuses.PUBLISHED &&
  lesson.availableFrom <= now &&
  lesson.availableUntil > now;

// Remove a protected lesson asset from Cloudinary.
export const deleteLessonAsset = async (asset, resourceType) => {
  if (!asset?.publicId) return;

  await cloudinary.uploader.destroy(asset.publicId, {
    resource_type: resourceType,
    type: "authenticated",
    timeout: 10000,
  });
};

// Remove uploaded media if the matching lesson database change fails.
export const discardUploadedLessonMedia = async (media) => {
  await Promise.allSettled(
    (media?.uploadedAssets ?? []).map(({ asset, resourceType }) =>
      queueMediaCleanup(asset, resourceType).catch(async () => {
        try { await deleteLessonAsset(asset, resourceType); } catch (error) { console.error(messages.error.cleanupFailed, error.code || error.name); }
      })
    )
  );
};

// Upload protected lesson media and always remove the local temporary files.
export const uploadLessonMedia = async (files = {}) => {
  const videoFile = files.video?.[0];
  const attachmentFiles = files.attachments ?? [];
  const uploadedAssets = [];

  try {
    let video;
    if (videoFile) {
      const uploadedVideo = await cloudinary.uploader.upload(videoFile.path, {
        folder: "noldg_academy/lessons/videos",
        resource_type: "video",
        type: "authenticated",
      });
      video = {
        publicId: uploadedVideo.public_id,
        format: uploadedVideo.format,
        duration: uploadedVideo.duration,
      };
      uploadedAssets.push({ asset: video, resourceType: "video" });
    }

    const attachments = [];
    for (const file of attachmentFiles) {
      const uploadedAttachment = await cloudinary.uploader.upload(file.path, {
        folder: "noldg_academy/lessons/attachments",
        resource_type: "raw",
        type: "authenticated",
      });
      const attachment = {
        name: file.originalname,
        publicId: uploadedAttachment.public_id,
        format: uploadedAttachment.format || path.extname(file.originalname).slice(1).toLowerCase(),
      };
      attachments.push(attachment);
      uploadedAssets.push({ asset: attachment, resourceType: "raw" });
    }

    return { video, attachments, uploadedAssets };
  } catch (error) {
    await discardUploadedLessonMedia({ uploadedAssets });
    throw error;
  } finally {
    for (const file of [videoFile, ...attachmentFiles].filter(Boolean)) {
      try {
        deleteFile(file.path);
      } catch {
        // Ignore temporary-file cleanup errors after the upload attempt.
      }
    }
  }
};

// Delete videos whose availability window ended at least 30 days ago.
export const cleanupExpiredLessonVideos = async () => {
  const retentionCutoff = new Date(Date.now() - videoRetentionMs);
  const lessons = await Lesson.findMany({
    where: {
      availableUntil: { lte: retentionCutoff },
      video: { not: Prisma.DbNull },
    },
  });

  for (const lesson of lessons) {
    await prisma.$transaction(async (transaction) => {
      const detached = await transaction.lesson.updateMany({
        where: { id: lesson.id, updatedAt: lesson.updatedAt, availableUntil: { lte: retentionCutoff }, video: { equals: lesson.video } },
        data: { video: Prisma.DbNull },
      });
      if (detached.count) await queueMediaCleanup(lesson.video, "video", true, transaction);
    });
  }
};

// Run video retention cleanup at startup and once per day.
export const startLessonVideoCleanup = () => {
  const runCleanup = () => {
    cleanupExpiredLessonVideos().catch((error) => {
      console.error(messages.lesson.videoCleanupFailed, error.message);
    });
  };

  runCleanup();
  const cleanupInterval = setInterval(runCleanup, 24 * 60 * 60 * 1000);
  cleanupInterval.unref();
};
