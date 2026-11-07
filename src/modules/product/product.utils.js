import {
  Course,
  Lesson,
  PlatformSettings,
  TeacherProfile,
} from "../../../db/index.js";
import { lessonStatuses, productTypes } from "../../utils/constant/enum.js";

// Return the saved platform commission, creating its 20% default when needed.
export const getPlatformSettings = async () =>
  PlatformSettings.upsert({
    where: { settingsKey: "platform" },
    update: {},
    create: {
      id: "platform",
      settingsKey: "platform",
      commissionPercentage: 20,
    },
  });

// Calculate a product's current price and teacher/platform shares.
export const calculateProductPricing = async (product, now = new Date()) => {
  let remainingLessonCount = 0;
  let hasPublishedLesson = false;
  let isFreeLesson = false;

  if (product.type === productTypes.LESSON) {
    const lesson = await Lesson.findFirst({
      where: {
        id: product.lessonId,
        courseId: product.courseId,
        status: lessonStatuses.PUBLISHED,
        availableUntil: { gt: now },
      },
      select: { id: true, isFree: true },
    });
    remainingLessonCount = lesson ? 1 : 0;
    hasPublishedLesson = Boolean(lesson);
    isFreeLesson = lesson?.isFree === true;
  } else {
    [remainingLessonCount, hasPublishedLesson] = await Promise.all([
      Lesson.count({
        where: {
          courseId: product.courseId,
          status: { not: lessonStatuses.ARCHIVED },
          availableUntil: { gt: now },
        },
      }),
      Lesson.findFirst({
        where: { courseId: product.courseId, status: lessonStatuses.PUBLISHED },
        select: { id: true },
      }),
    ]);
    hasPublishedLesson = Boolean(hasPublishedLesson);
  }

  const currentPrice =
    product.type === productTypes.LESSON
      ? isFreeLesson ? 0 : product.price
      : Math.round(
          product.price *
            (remainingLessonCount / product.announcedLessonCount)
        );
  const course = await Course.findUnique({
    where: { id: product.courseId },
    select: { teacherId: true },
  });
  const [settings, teacherProfile] = await Promise.all([
    getPlatformSettings(),
    course
      ? TeacherProfile.findUnique({
          where: { userId: course.teacherId },
          select: { commissionPercentage: true },
        })
      : null,
  ]);
  const commissionPercentage =
    teacherProfile?.commissionPercentage ?? settings.commissionPercentage;
  const platformAmount = Number(
    ((currentPrice * commissionPercentage) / 100).toFixed(2)
  );

  return {
    fullPrice: product.price,
    currentPrice,
    announcedLessonCount: product.announcedLessonCount ?? 1,
    remainingLessonCount,
    commissionPercentage,
    platformAmount,
    teacherAmount: Number((currentPrice - platformAmount).toFixed(2)),
    isPurchasable:
      product.isActive && remainingLessonCount > 0 && hasPublishedLesson && !isFreeLesson,
  };
};

// Capture the calculated price and commission for an order's immutable snapshot.
export const createProductPriceSnapshot = async (product, now = new Date(), pricing) => {
  pricing ??= await calculateProductPricing(product, now);

  return {
    productId: product.id,
    fullPrice: pricing.fullPrice,
    salePrice: pricing.currentPrice,
    announcedLessonCount: pricing.announcedLessonCount,
    remainingLessonCount: pricing.remainingLessonCount,
    commissionPercentage: pricing.commissionPercentage,
    platformAmount: pricing.platformAmount,
    teacherAmount: pricing.teacherAmount,
    calculatedAt: now,
  };
};
