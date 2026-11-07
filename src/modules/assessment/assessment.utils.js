import { Prisma } from "@prisma/client";
import { prisma } from "../../../db/index.js";
import { AppError } from "../../utils/appError.js";
import { messages } from "../../utils/constant/messages.js";
import { assessmentTypes, productTypes, roles, teacherApprovalStatuses } from "../../utils/constant/enum.js";
import { hasLessonAccess } from "../lesson/lesson-access.utils.js";
import { getWatchRequirement } from "../learning/learning.utils.js";

export const assertAssessmentManager = async (authUser, teacherId, transaction = prisma) => {
  if (authUser.roles !== roles.TEACHER) return;
  if (authUser.id !== teacherId) throw new AppError(messages.user.unauthorized, 403);
  const profile = await transaction.teacherProfile.findFirst({
    where: { userId: authUser.id, approvalStatus: teacherApprovalStatuses.APPROVED }, select: { id: true },
  });
  if (!profile) throw new AppError(messages.teacher.approvalRequired, 403);
};

// Bank edits and deletion must not change an assessment's saved question content.
export const snapshotAssessmentQuestions = async (selections, teacherId, transaction) => {
  const questions = await transaction.question.findMany({
    where: { teacherId, id: { in: selections.map(({ questionId }) => questionId) } },
  });
  if (questions.length !== selections.length) throw new AppError(messages.assessment.invalidQuestions, 400);
  const byId = new Map(questions.map((question) => [question.id, question]));
  return selections.map(({ questionId, points }, position) => {
    const question = byId.get(questionId);
    return { sourceQuestionId: question.id, position, text: question.text, type: question.type, options: question.options, correctAnswer: question.correctAnswer ?? Prisma.DbNull, points };
  });
};

export const validateAssessmentSettings = async (settings, transaction) => {
  if (settings.opensAt && settings.closesAt && new Date(settings.closesAt) <= new Date(settings.opensAt)) {
    throw new AppError(messages.error.invalidRequest, 400);
  }
  for (const lessonId of [settings.lessonId, settings.watchLessonId].filter(Boolean)) {
    const lesson = await transaction.lesson.findFirst({ where: { id: lessonId, courseId: settings.courseId } });
    if (!lesson) throw new AppError(messages.assessment.invalidLesson, 400);
    if (lessonId === settings.watchLessonId && (!lesson.video?.publicId || !Number.isFinite(Number(lesson.video.duration)) || Number(lesson.video.duration) <= 0)) {
      throw new AppError(messages.learning.videoUnavailable, 400);
    }
  }
};

// A package grant counts as package access; a standalone lesson never grants an exam.
export const hasAssessmentEntitlement = async (studentId, assessment, transaction = prisma, now = new Date()) => {
  if (assessment.type === assessmentTypes.EXAM) {
    return Boolean(await transaction.productAccess.findFirst({
      where: { studentId, product: { is: { courseId: assessment.courseId, type: productTypes.PACKAGE } } },
      select: { id: true },
    }));
  }
  const lesson = await transaction.lesson.findUnique({ where: { id: assessment.lessonId } });
  return lesson ? hasLessonAccess(studentId, lesson, now, transaction) : false;
};

export const assertAssessmentStudentAccess = async (studentId, assessment, transaction = prisma, now = new Date()) => {
  if (!(await hasAssessmentEntitlement(studentId, assessment, transaction, now))) {
    throw new AppError(messages.assessment.accessDenied, 403);
  }
  if (assessment.lessonId) {
    const lesson = await transaction.lesson.findUnique({ where: { id: assessment.lessonId } });
    const requirement = await getWatchRequirement(studentId, lesson, transaction);
    if (!requirement.isMet) throw new AppError(messages.learning.prerequisiteRequired(lesson.requiredWatchPercentage), 403);
  }
  const requirement = await getWatchRequirement(studentId, {
    prerequisiteLessonId: assessment.watchLessonId,
    requiredWatchPercentage: assessment.requiredWatchPercentage,
  }, transaction);
  if (!requirement.isMet) throw new AppError(messages.learning.prerequisiteRequired(assessment.requiredWatchPercentage), 403);
};

// Student assessment metadata never contains questions or answer keys before an attempt starts.
export const formatAssessment = (assessment, student = false) => {
  if (!student) return assessment;
  const { questions, ...data } = assessment;
  return data;
};
