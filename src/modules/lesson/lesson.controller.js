import { AppError } from "../../utils/appError.js";
import { Prisma } from "@prisma/client";
import { queueMediaCleanup } from "../../utils/media-cleanup.js";
import { notifyCourseStudents } from "../notification/notification.utils.js";
import { assertLessonUploadsUnused, createLessonUpload, prepareLessonMedia } from "./lesson-upload.utils.js";
import { messages } from "../../utils/constant/messages.js";
import {
  Course,
  Lesson,
  TeacherProfile,
  prisma,
} from "../../../db/index.js";
import {
  lessonStatuses,
  lessonTypes,
  productTypes,
  teacherApprovalStatuses,
} from "../../utils/constant/enum.js";
import {
  discardUploadedLessonMedia,
} from "./lesson.utils.js";

// Find an approved teacher's course before allowing lesson management.
const getTeacherCourse = async (teacherId, courseId, next) => {
  const teacherProfile = await TeacherProfile.findFirst({
    where: {
      userId: teacherId,
      approvalStatus: teacherApprovalStatuses.APPROVED,
    },
  });

  if (!teacherProfile) {
    next(new AppError(messages.lesson.teacherApprovalRequired, 403));
    return null;
  }

  const course = await Course.findFirst({ where: { id: courseId, teacherId } });
  if (!course) {
    next(new AppError(messages.lesson.courseNotFound, 404));
    return null;
  }

  return course;
};

// Find a lesson only when it belongs to the authenticated teacher.
const getTeacherLesson = async (teacherId, lessonId, next) => {
  const lesson = await Lesson.findUnique({ where: { id: lessonId } });
  if (!lesson) {
    next(new AppError(messages.lesson.notFound, 404));
    return null;
  }

  const course = await getTeacherCourse(teacherId, lesson.courseId, next);
  return course ? lesson : null;
};

// Authorize the teacher before issuing a direct Cloudinary upload signature.
export const signLessonUpload = async (req, res, next) => {
  const course = await getTeacherCourse(req.authUser._id, req.validatedParams.courseId, next);
  if (!course) return;

  const data = createLessonUpload({ teacherId: req.authUser._id, courseId: course.id, ...req.body });
  return res.status(200).json({ message: messages.lesson.uploadReady, success: true, data });
};

// List lessons in a course owned by the authenticated teacher.
export const getCourseLessons = async (req, res, next) => {
  const course = await getTeacherCourse(
    req.authUser._id,
    req.validatedParams.courseId,
    next
  );
  if (!course) return;

  const lessons = await Lesson.findMany({
    where: { courseId: course.id },
    orderBy: { createdAt: "asc" },
  });

  return res.status(200).json({
    message: messages.lesson.fetchedSuccessfully,
    success: true,
    count: lessons.length,
    data: lessons,
  });
};

// Create and publish a complete recorded lesson with its video and availability window.
export const createLesson = async (req, res, next) => {
  const course = await getTeacherCourse(
    req.authUser._id,
    req.validatedParams.courseId,
    next
  );
  if (!course) return;

  if (req.body.type === lessonTypes.LIVE) {
    return next(new AppError(messages.lesson.liveDisabled, 400));
  }

  if (!req.files?.video?.[0] && !req.body.videoUploadToken) {
    return next(new AppError(messages.lesson.videoRequired, 400));
  }

  const media = await prepareLessonMedia(req.files, req.body, { teacherId: req.authUser._id, courseId: course.id });
  const { videoUploadToken, attachmentUploadTokens, ...lessonData } = req.body;
  let lesson;
  try {
    lesson = await prisma.$transaction(async (transaction) => {
      await assertLessonUploadsUnused(media, transaction);
      const createdLesson = await transaction.lesson.create({
        data: {
          courseId: course.id,
          ...lessonData,
          availableFrom: new Date(req.body.availableFrom),
          availableUntil: new Date(req.body.availableUntil),
          video: media.video,
          attachments: media.attachments,
          status: lessonStatuses.PUBLISHED,
          publishedAt: new Date(),
        },
      });
      await notifyCourseStudents({
        courseId: course.id, lessonId: createdLesson.id, isFree: createdLesson.isFree,
        type: "lesson_published", title: "New lesson published", body: createdLesson.title,
        entityId: createdLesson.id, eventKey: `lesson_published:${createdLesson.id}`,
      }, transaction);
      return createdLesson;
    });
  } catch (error) {
    await discardUploadedLessonMedia(media);
    throw error;
  }

  return res.status(201).json({
    message: messages.lesson.created,
    success: true,
    data: lesson,
  });
};

// Update a teacher-owned lesson and append any new attachments.
export const updateLesson = async (req, res, next) => {
  const lesson = await getTeacherLesson(
    req.authUser._id,
    req.validatedParams.lessonId,
    next
  );
  if (!lesson) return;

  if (req.body.type === lessonTypes.LIVE) {
    return next(new AppError(messages.lesson.liveDisabled, 400));
  }

  if (
    Object.keys(req.body).length === 0 &&
    !Object.values(req.files ?? {}).some((files) => files.length > 0)
  ) {
    return next(new AppError(messages.lesson.updateRequired, 400));
  }

  const media = await prepareLessonMedia(req.files, req.body, { teacherId: req.authUser._id, courseId: lesson.courseId });
  const { videoUploadToken, attachmentUploadTokens, ...lessonData } = req.body;
  const updatedData = {
    ...lessonData,
    ...(req.body.availableFrom && {
      availableFrom: new Date(req.body.availableFrom),
    }),
    ...(req.body.availableUntil && {
      availableUntil: new Date(req.body.availableUntil),
    }),
    ...(media.video && { video: media.video }),
  };
  let updatedLesson;
  try {
    updatedLesson = await prisma.$transaction(async (transaction) => {
      await assertLessonUploadsUnused(media, transaction);
      const current = await transaction.lesson.findUnique({ where: { id: lesson.id } });
      const updated = await transaction.lesson.update({ where: { id: lesson.id }, data: { ...updatedData, ...(media.attachments.length && { attachments: [...current.attachments, ...media.attachments] }) } });
      if (req.body.title !== undefined) await transaction.product.updateMany({ where: { type: productTypes.LESSON, lessonId: lesson.id }, data: { name: updated.title } });
      if (media.video && current.video) await queueMediaCleanup(current.video, "video", true, transaction);
      if (updated.status === lessonStatuses.PUBLISHED) await notifyCourseStudents({
        courseId: updated.courseId, lessonId: updated.id, isFree: updated.isFree,
        type: "lesson_updated", title: "Lesson updated", body: updated.title,
        entityId: updated.id, eventKey: `lesson_updated:${updated.id}:${updated.updatedAt.toISOString()}`,
      }, transaction);
      return updated;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    await discardUploadedLessonMedia(media);
    throw error;
  }

  return res.status(200).json({
    message: messages.lesson.updated,
    success: true,
    data: updatedLesson,
  });
};

// Change publication state while keeping it separate from the time window.
export const updateLessonStatus = async (req, res, next) => {
  const lesson = await getTeacherLesson(
    req.authUser._id,
    req.validatedParams.lessonId,
    next
  );
  if (!lesson) return;

  const { status } = req.body;
  if (status === lessonStatuses.PUBLISHED && !lesson.video) {
    return next(new AppError(messages.lesson.videoRequired, 400));
  }

  const updatedLesson = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.lesson.update({
      where: { id: lesson.id },
      data: {
        status,
        publishedAt:
          status === lessonStatuses.PUBLISHED
            ? lesson.publishedAt ?? new Date()
            : null,
      },
    });
    if (status !== lesson.status) await notifyCourseStudents({
      courseId: updated.courseId, lessonId: updated.id, isFree: updated.isFree,
      type: status === lessonStatuses.PUBLISHED ? "lesson_published" : "lesson_unpublished",
      title: status === lessonStatuses.PUBLISHED ? "Lesson published" : "Lesson unavailable", body: updated.title,
      entityId: updated.id, eventKey: `lesson_status:${updated.id}:${updated.updatedAt.toISOString()}`,
    }, transaction);
    return updated;
  });

  return res.status(200).json({
    message: messages.lesson.updated,
    success: true,
    data: updatedLesson,
  });
};
