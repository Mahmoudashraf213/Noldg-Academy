import { AppError } from "../../utils/appError.js";
import { fanoutNotification, notificationManagers, notifyCourseStudents } from "../notification/notification.utils.js";
import { messages } from "../../utils/constant/messages.js";
import {
  Course,
  Lesson,
  Product,
  TeacherProfile,
  prisma,
} from "../../../db/index.js";
import {
  lessonStatuses,
  productTypes,
  teacherApprovalStatuses,
  roles,
} from "../../utils/constant/enum.js";
import {
  calculateProductPricing,
  getPlatformSettings,
} from "./product.utils.js";

// Find an approved teacher-owned course for product management.
const getTeacherCourse = async (teacherId, courseId, next) => {
  const teacherProfile = await TeacherProfile.findFirst({
    where: {
      userId: teacherId,
      approvalStatus: teacherApprovalStatuses.APPROVED,
    },
  });

  if (!teacherProfile) {
    next(new AppError(messages.product.teacherApprovalRequired, 403));
    return null;
  }

  const course = await Course.findFirst({ where: { id: courseId, teacherId } });
  if (!course) {
    next(new AppError(messages.product.courseNotFound, 404));
    return null;
  }

  return course;
};

// Create a single-lesson product or a course package with teacher-set pricing.
export const createProduct = async (req, res, next) => {
  const { courseId, type, lessonId, name, price, announcedLessonCount } = req.body;
  const course = await getTeacherCourse(req.authUser.id, courseId, next);
  if (!course) return;

  let productName = name;
  let productLessonId = null;
  if (type === productTypes.LESSON) {
    const lesson = await Lesson.findFirst({
      where: {
        id: lessonId,
        courseId: course.id,
        status: lessonStatuses.PUBLISHED,
      },
    });

    if (!lesson) {
      return next(new AppError(messages.product.lessonNotFound, 404));
    }

    const existingProduct = await Product.findFirst({
      where: { type: productTypes.LESSON, lessonId: lesson.id },
      select: { id: true },
    });
    if (existingProduct) {
      return next(new AppError(messages.product.duplicateProduct, 409));
    }

    productName = lesson.title;
    productLessonId = lesson.id;
  }

  if (type === productTypes.PACKAGE) {
    const existingPackage = await Product.findFirst({
      where: { courseId: course.id, type, name },
      select: { id: true },
    });
    if (existingPackage) {
      return next(new AppError(messages.product.duplicateProduct, 409));
    }
  }

  const product = await prisma.$transaction(async (transaction) => {
    const created = await transaction.product.create({
      data: {
        courseId: course.id,
        lessonId: productLessonId,
        type,
        name: productName,
        price,
        ...(type === productTypes.PACKAGE && { announcedLessonCount }),
      },
    });
    await notifyCourseStudents({
      courseId: course.id, type: "product_created", title: "New learning product", body: created.name,
      entityId: created.id, eventKey: `product_created:${created.id}`,
    }, transaction);
    return created;
  });
  const pricing = await calculateProductPricing(product);

  return res.status(201).json({
    message: messages.product.created,
    success: true,
    data: { product, pricing },
  });
};

// List products owned by the authenticated teacher with current price breakdowns.
export const getMyProducts = async (req, res, next) => {
  const teacherProfile = await TeacherProfile.findFirst({
    where: {
      userId: req.authUser.id,
      approvalStatus: teacherApprovalStatuses.APPROVED,
    },
  });

  if (!teacherProfile) {
    return next(new AppError(messages.product.teacherApprovalRequired, 403));
  }

  const courses = await Course.findMany({
    where: { teacherId: req.authUser.id },
    select: { id: true },
  });
  const courseIds = courses.map(({ id }) => id);
  const products = await Product.findMany({
    where: { courseId: { in: courseIds } },
    include: {
      course: {
        include: {
          track: { select: { id: true, system: true, stage: true, grade: true, name: true } },
          subject: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  const data = await Promise.all(
    products.map(async ({ course: { track, subject, ...course }, ...product }) => ({
      product: {
        ...product,
        courseId: {
          ...course,
          trackId: track,
          subjectId: subject,
        },
      },
      pricing: await calculateProductPricing(product),
    }))
  );

  return res.status(200).json({
    message: messages.product.fetchedSuccessfully,
    success: true,
    count: data.length,
    data,
  });
};

// Return the current price and commission breakdown for an active product.
export const getProductPricing = async (req, res, next) => {
  const product = await Product.findFirst({
    where: { id: req.validatedParams.productId, isActive: true },
  });

  if (!product) {
    return next(new AppError(messages.product.notFound, 404));
  }

  const pricing = await calculateProductPricing(product);
  if (!pricing.isPurchasable) {
    return next(new AppError(messages.product.noRemainingLessons, 409));
  }

  return res.status(200).json({
    message: messages.product.fetchedSuccessfully,
    success: true,
    data: { product, pricing },
  });
};

// Update an owned product's name, full price, package size, or active state.
export const updateProduct = async (req, res, next) => {
  const product = await Product.findUnique({
    where: { id: req.validatedParams.productId },
  });
  if (!product) {
    return next(new AppError(messages.product.notFound, 404));
  }

  const course = await getTeacherCourse(req.authUser.id, product.courseId, next);
  if (!course) return;

  if (
    product.type === productTypes.LESSON &&
    req.body.announcedLessonCount !== undefined
  ) {
    return next(new AppError(messages.error.invalidRequest, 400));
  }

  const updatedProduct = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.product.update({ where: { id: product.id }, data: req.body });
    await notifyCourseStudents({
      courseId: product.courseId, lessonId: product.lessonId, type: "product_updated", title: "Learning product updated", body: updated.name,
      entityId: updated.id, eventKey: `product_updated:${updated.id}:${updated.updatedAt.toISOString()}`,
    }, transaction);
    return updated;
  });

  return res.status(200).json({
    message: messages.product.updated,
    success: true,
    data: {
      product: updatedProduct,
      pricing: await calculateProductPricing(updatedProduct),
    },
  });
};

// Return the current platform commission to the super admin.
export const getPlatformCommission = async (req, res) => {
  const settings = await getPlatformSettings();

  return res.status(200).json({
    message: messages.product.commissionFetched,
    success: true,
    data: { commissionPercentage: settings.commissionPercentage },
  });
};

// Update the platform commission setting as the super admin.
export const updatePlatformCommission = async (req, res) => {
  const settings = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.platformSettings.upsert({
      where: { settingsKey: "platform" },
      update: { commissionPercentage: req.body.commissionPercentage },
      create: {
        id: "platform",
        settingsKey: "platform",
        commissionPercentage: req.body.commissionPercentage,
      },
    });
    const teachers = await transaction.teacherProfile.findMany({ where: { commissionPercentage: null }, select: { userId: true } });
    await fanoutNotification({
      userIds: teachers.map(({ userId }) => userId), managerRoles: [roles.SUPER_ADMIN],
      type: "platform_commission_changed", title: "Platform commission updated", body: `${updated.commissionPercentage}%`,
      entityId: updated.id, eventKey: `platform_commission:${updated.updatedAt.toISOString()}`,
    }, transaction);
    return updated;
  });

  return res.status(200).json({
    message: messages.product.commissionUpdated,
    success: true,
    data: { commissionPercentage: settings.commissionPercentage },
  });
};

// Return a teacher's custom commission or the current platform default.
export const getTeacherCommission = async (req, res, next) => {
  const teacherProfile = await TeacherProfile.findUnique({
    where: { userId: req.validatedParams.teacherId },
  });

  if (!teacherProfile) {
    return next(new AppError(messages.teacher.profileNotFound, 404));
  }

  const settings = await getPlatformSettings();
  const usesPlatformDefault = teacherProfile.commissionPercentage == null;

  return res.status(200).json({
    message: messages.product.teacherCommissionFetched,
    success: true,
    data: {
      teacherId: teacherProfile.userId,
      commissionPercentage: usesPlatformDefault
        ? settings.commissionPercentage
        : teacherProfile.commissionPercentage,
      usesPlatformDefault,
      defaultCommissionPercentage: settings.commissionPercentage,
    },
  });
};

// Set a teacher-specific commission or clear it to use the platform default.
export const updateTeacherCommission = async (req, res, next) => {
  const teacherProfile = await TeacherProfile.findUnique({
    where: { userId: req.validatedParams.teacherId },
  });

  if (!teacherProfile) {
    return next(new AppError(messages.teacher.profileNotFound, 404));
  }

  const updatedProfile = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.teacherProfile.update({
      where: { id: teacherProfile.id },
      data: { commissionPercentage: req.body.commissionPercentage },
    });
    if (teacherProfile.commissionPercentage !== updated.commissionPercentage) await fanoutNotification({
      userIds: [updated.userId], managerRoles: notificationManagers,
      type: "teacher_commission_changed", title: "Teacher commission updated", body: `${updated.commissionPercentage ?? "Platform default"}`,
      entityId: updated.userId, eventKey: `teacher_commission:${updated.id}:${updated.updatedAt.toISOString()}`,
    }, transaction);
    return updated;
  });
  const settings = await getPlatformSettings();
  const usesPlatformDefault = updatedProfile.commissionPercentage == null;

  return res.status(200).json({
    message: messages.product.teacherCommissionUpdated,
    success: true,
    data: {
      teacherId: updatedProfile.userId,
      commissionPercentage: usesPlatformDefault
        ? settings.commissionPercentage
        : updatedProfile.commissionPercentage,
      usesPlatformDefault,
      defaultCommissionPercentage: settings.commissionPercentage,
    },
  });
};
