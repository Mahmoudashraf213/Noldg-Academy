import { Prisma } from "@prisma/client";
import { notifyCourseStudents } from "../notification/notification.utils.js";
import { Assessment, Course, prisma } from "../../../db/index.js";
import { AppError } from "../../utils/appError.js";
import { messages } from "../../utils/constant/messages.js";
import { assessmentStatuses, assessmentTypes, roles } from "../../utils/constant/enum.js";
import { assertAssessmentManager, assertAssessmentStudentAccess, formatAssessment, hasAssessmentEntitlement, snapshotAssessmentQuestions, validateAssessmentSettings } from "./assessment.utils.js";

export const createAssessment = async (req, res) => {
  const assessment = await prisma.$transaction(async (transaction) => {
    const course = await transaction.course.findUnique({ where: { id: req.body.courseId } });
    if (!course) throw new AppError(messages.course.notFound, 404);
    await assertAssessmentManager(req.authUser, course.teacherId, transaction);
    await validateAssessmentSettings(req.body, transaction);
    const { questions, ...settings } = req.body;
    const snapshots = await snapshotAssessmentQuestions(questions, course.teacherId, transaction);
    return transaction.assessment.create({
      data: { ...settings, teacherId: course.teacherId, totalPoints: Number(snapshots.reduce((sum, question) => sum + question.points, 0).toFixed(2)), questions: { create: snapshots } },
      include: { questions: { orderBy: { position: "asc" } } },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 });
  return res.status(201).json({ message: messages.assessment.created, success: true, data: assessment });
};

export const updateAssessment = async (req, res) => {
  const assessment = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.assessment.findUnique({ where: { id: req.validatedParams.assessmentId } });
    if (!existing) throw new AppError(messages.assessment.notExist, 404);
    await assertAssessmentManager(req.authUser, existing.teacherId, transaction);
    if (existing.status !== assessmentStatuses.DRAFT) throw new AppError(messages.assessment.draftOnly, 409);
    await validateAssessmentSettings({ ...existing, ...req.body }, transaction);
    const { questions, ...settings } = req.body;
    const snapshots = questions ? await snapshotAssessmentQuestions(questions, existing.teacherId, transaction) : null;
    return transaction.assessment.update({
      where: { id: existing.id },
      data: { ...settings, ...(snapshots && { totalPoints: Number(snapshots.reduce((sum, question) => sum + question.points, 0).toFixed(2)), questions: { deleteMany: {}, create: snapshots } }) },
      include: { questions: { orderBy: { position: "asc" } } },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 });
  return res.status(200).json({ message: messages.assessment.updated, success: true, data: assessment });
};

export const publishAssessment = async (req, res) => {
  const assessment = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.assessment.findUnique({ where: { id: req.validatedParams.assessmentId } });
    if (!existing) throw new AppError(messages.assessment.notExist, 404);
    await assertAssessmentManager(req.authUser, existing.teacherId, transaction);
    if (existing.status !== assessmentStatuses.DRAFT) throw new AppError(messages.assessment.draftOnly, 409);
    if (existing.closesAt && existing.closesAt <= new Date()) throw new AppError(messages.assessment.notOpen, 409);
    const published = await transaction.assessment.update({ where: { id: existing.id }, data: { status: assessmentStatuses.PUBLISHED, publishedAt: new Date() } });
    const lesson = existing.lessonId ? await transaction.lesson.findUnique({ where: { id: existing.lessonId } }) : null;
    await notifyCourseStudents({
      courseId: existing.courseId, lessonId: existing.lessonId, packagesOnly: existing.type === assessmentTypes.EXAM, isFree: existing.type !== assessmentTypes.EXAM && Boolean(lesson?.isFree),
      type: "assessment_published", title: `New ${existing.type}`, body: existing.title,
      entityId: existing.id, eventKey: `assessment_published:${existing.id}`,
    }, transaction);
    return published;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return res.status(200).json({ message: messages.assessment.published, success: true, data: assessment });
};

export const closeAssessment = async (req, res) => {
  const assessment = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.assessment.findUnique({ where: { id: req.validatedParams.assessmentId } });
    if (!existing) throw new AppError(messages.assessment.notExist, 404);
    await assertAssessmentManager(req.authUser, existing.teacherId, transaction);
    if (existing.status !== assessmentStatuses.PUBLISHED) throw new AppError(messages.assessment.notOpen, 409);
    const closed = await transaction.assessment.update({ where: { id: existing.id }, data: { status: assessmentStatuses.CLOSED, closedAt: new Date() } });
    const lesson = existing.lessonId ? await transaction.lesson.findUnique({ where: { id: existing.lessonId } }) : null;
    await notifyCourseStudents({
      courseId: existing.courseId, lessonId: existing.lessonId, packagesOnly: existing.type === assessmentTypes.EXAM, isFree: existing.type !== assessmentTypes.EXAM && Boolean(lesson?.isFree),
      type: "assessment_closed", title: "Assessment closed", body: existing.title,
      entityId: existing.id, eventKey: `assessment_closed:${existing.id}`,
    }, transaction);
    return closed;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return res.status(200).json({ message: messages.assessment.closed, success: true, data: assessment });
};

export const getAssessmentById = async (req, res, next) => {
  const assessment = await Assessment.findUnique({ where: { id: req.validatedParams.assessmentId }, include: { questions: { orderBy: { position: "asc" } } } });
  if (!assessment) return next(new AppError(messages.assessment.notExist, 404));
  const student = req.authUser.roles === roles.STUDENT;
  if (student) {
    if (assessment.status === assessmentStatuses.DRAFT) return next(new AppError(messages.assessment.notExist, 404));
    await assertAssessmentStudentAccess(req.authUser.id, assessment);
  } else await assertAssessmentManager(req.authUser, assessment.teacherId);
  return res.status(200).json({ message: messages.assessment.fetchedSuccessfully, success: true, data: formatAssessment(assessment, student) });
};

export const getAssessments = async (req, res) => {
  await assertAssessmentManager(req.authUser, req.authUser.id);
  const { page, limit, courseId, teacherId, lessonId, type, status } = req.validatedQuery;
  const where = {
    ...(req.authUser.roles === roles.TEACHER ? { teacherId: req.authUser.id } : teacherId && { teacherId }),
    ...(courseId && { courseId }), ...(lessonId && { lessonId }), ...(type && { type }), ...(status && { status }),
  };
  const [assessments, total] = await Promise.all([
    Assessment.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    Assessment.count({ where }),
  ]);
  return res.status(200).json({ message: messages.assessment.fetchedSuccessfully, success: true, count: total, data: assessments, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
};

export const getCourseAssessments = async (req, res, next) => {
  const course = await Course.findUnique({ where: { id: req.validatedParams.courseId } });
  if (!course) return next(new AppError(messages.course.notFound, 404));
  const student = req.authUser.roles === roles.STUDENT;
  if (!student) await assertAssessmentManager(req.authUser, course.teacherId);
  const assessments = await Assessment.findMany({
    where: { courseId: course.id, ...(student && { status: { in: [assessmentStatuses.PUBLISHED, assessmentStatuses.CLOSED] } }) },
    orderBy: { createdAt: "desc" },
  });
  const visible = student
    ? (await Promise.all(assessments.map(async (assessment) => await hasAssessmentEntitlement(req.authUser.id, assessment) ? assessment : null))).filter(Boolean)
    : assessments;
  return res.status(200).json({ message: messages.assessment.fetchedSuccessfully, success: true, count: visible.length, data: visible });
};
