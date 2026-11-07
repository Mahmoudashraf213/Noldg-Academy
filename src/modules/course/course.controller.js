import { AppError } from "../../utils/appError.js";
import { messages } from "../../utils/constant/messages.js";
import {
  Course,
  Product,
  ProductAccess,
  TeacherProfile,
  User,
} from "../../../db/index.js";
import {
  roles,
  teacherApprovalStatuses,
  userStatuses,
} from "../../utils/constant/enum.js";
import { syncTeacherCourses } from "./course.utils.js";

// Return the authenticated teacher's courses created from their offerings.
export const getMyCourses = async (req, res, next) => {
  const profile = await TeacherProfile.findUnique({
    where: { userId: req.authUser.id },
    include: { offerings: true },
  });

  if (!profile) {
    return next(new AppError(messages.teacher.applicationNotFound, 404));
  }

  await syncTeacherCourses(profile.userId, profile.offerings);

  const courses = await Course.findMany({
    where: {
      teacherId: profile.userId,
      OR: profile.offerings.map(({ trackId, subjectId }) => ({ trackId, subjectId })),
    },
    include: { track: true, subject: true },
    orderBy: { createdAt: "desc" },
  });
  const data = courses.map(({ track, subject, ...course }) => ({
    ...course,
    trackId: track,
    subjectId: subject,
  }));

  return res.status(200).json({
    message: messages.course.fetchedSuccessfully,
    success: true,
    count: courses.length,
    data,
  });
};

// List students who have access to any purchased product in the teacher's course.
export const getCourseStudents = async (req, res, next) => {
  const teacherProfile = await TeacherProfile.findFirst({
    where: {
      userId: req.authUser.id,
      approvalStatus: teacherApprovalStatuses.APPROVED,
    },
  });

  if (!teacherProfile) {
    return next(new AppError(messages.lesson.teacherApprovalRequired, 403));
  }

  const course = await Course.findFirst({
    where: { id: req.validatedParams.courseId, teacherId: req.authUser.id },
  });

  if (!course) {
    return next(new AppError(messages.course.notFound, 404));
  }

  const products = await Product.findMany({
    where: { courseId: course.id },
    select: { id: true },
  });
  const productIds = products.map(({ id }) => id);
  const accesses = productIds.length
    ? await ProductAccess.findMany({
        where: { productId: { in: productIds } },
        select: { studentId: true },
        distinct: ["studentId"],
      })
    : [];
  const students = await User.findMany({
    where: {
      id: { in: accesses.map(({ studentId }) => studentId) },
      roles: roles.STUDENT,
      status: userStatuses.ACTIVE,
    },
    select: { id: true, name: true, email: true, phone: true },
  });

  return res.status(200).json({
    message: messages.course.studentsFetchedSuccessfully,
    success: true,
    count: students.length,
    data: students,
  });
};
