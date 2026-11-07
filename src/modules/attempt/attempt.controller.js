import { Prisma } from "@prisma/client";
import { prisma } from "../../../db/index.js";
import { AppError } from "../../utils/appError.js";
import { messages } from "../../utils/constant/messages.js";
import { assessmentStatuses, attemptStatuses, roles } from "../../utils/constant/enum.js";
import { assertAssessmentManager, assertAssessmentStudentAccess } from "../assessment/assessment.utils.js";
import { attemptInclude, finalizeAttempt, formatAttempt, loadAccessibleAttempt, saveAttemptAnswers } from "./attempt.utils.js";

export const startAttempt = async (req, res, next) => {
  const result = await prisma.$transaction(async (transaction) => {
    const now = new Date();
    const assessment = await transaction.assessment.findUnique({
      where: { id: req.body.assessmentId }, include: { questions: { orderBy: { position: "asc" } }, lesson: true },
    });
    if (!assessment) throw new AppError(messages.assessment.notExist, 404);
    let latest = await transaction.assessmentAttempt.findFirst({
      where: { assessmentId: assessment.id, studentId: req.authUser.id }, orderBy: { attemptNumber: "desc" }, include: attemptInclude,
    });
    if (latest) latest = await finalizeAttempt(latest, transaction, now);
    if (assessment.status !== assessmentStatuses.PUBLISHED || (assessment.opensAt && assessment.opensAt > now) || (assessment.closesAt && assessment.closesAt <= now)) {
      return { error: new AppError(messages.assessment.notOpen, 409) };
    }
    await assertAssessmentStudentAccess(req.authUser.id, assessment, transaction, now);
    if (latest?.status === attemptStatuses.IN_PROGRESS) return { attempt: latest, created: false };
    if ((latest?.attemptNumber ?? 0) >= assessment.maxAttempts) return { error: new AppError(messages.attempt.limitReached, 409) };
    const dates = [assessment.closesAt, assessment.lesson?.availableUntil,
      assessment.durationMinutes ? new Date(now.getTime() + assessment.durationMinutes * 60000) : null].filter(Boolean);
    const expiresAt = dates.sort((left, right) => left - right)[0] ?? null;
    const attempt = await transaction.assessmentAttempt.create({
      data: {
        assessmentId: assessment.id, studentId: req.authUser.id, attemptNumber: (latest?.attemptNumber ?? 0) + 1,
        totalPoints: assessment.totalPoints, startedAt: now, expiresAt,
        answers: { create: assessment.questions.map((question) => ({ assessmentQuestionId: question.id })) },
      }, include: attemptInclude,
    });
    return { attempt, created: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 });
  if (result.error) return next(result.error);
  return res.status(result.created ? 201 : 200).json({ message: messages.attempt.started, success: true, data: formatAttempt(result.attempt, true) });
};

export const saveAnswers = async (req, res, next) => {
  const result = await prisma.$transaction(async (transaction) => {
    let attempt = await loadAccessibleAttempt(req.validatedParams.attemptId, req.authUser, transaction);
    attempt = await finalizeAttempt(attempt, transaction);
    if (attempt.status !== attemptStatuses.IN_PROGRESS) return { error: new AppError(messages.attempt.alreadySubmitted, 409) };
    await assertAssessmentStudentAccess(req.authUser.id, attempt.assessment, transaction);
    return { attempt: await saveAttemptAnswers(attempt, req.body, transaction) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 });
  if (result.error) return next(result.error);
  return res.status(200).json({ message: messages.attempt.answersSaved, success: true, data: formatAttempt(result.attempt, true) });
};

export const submitAttempt = async (req, res, next) => {
  const result = await prisma.$transaction(async (transaction) => {
    let attempt = await loadAccessibleAttempt(req.validatedParams.attemptId, req.authUser, transaction);
    attempt = await finalizeAttempt(attempt, transaction);
    if (attempt.status !== attemptStatuses.IN_PROGRESS) return { attempt };
    await assertAssessmentStudentAccess(req.authUser.id, attempt.assessment, transaction);
    if (req.body.answers) attempt = await saveAttemptAnswers(attempt, req.body, transaction);
    return { attempt: await finalizeAttempt(attempt, transaction, new Date(), true) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 });
  if (result.error) return next(result.error);
  return res.status(200).json({ message: messages.attempt.submitted, success: true, data: formatAttempt(result.attempt, true) });
};

export const getAttemptById = async (req, res) => {
  const attempt = await prisma.$transaction(async (transaction) => {
    const attempt = await loadAccessibleAttempt(req.validatedParams.attemptId, req.authUser, transaction);
    return finalizeAttempt(attempt, transaction);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 });
  return res.status(200).json({ message: messages.attempt.fetchedSuccessfully, success: true, data: formatAttempt(attempt, req.authUser.roles === roles.STUDENT) });
};

export const getMyLatestAttempt = async (req, res) => {
  const attempt = await prisma.$transaction(async (transaction) => {
    const attempt = await transaction.assessmentAttempt.findFirst({
      where: { assessmentId: req.validatedParams.assessmentId, studentId: req.authUser.id }, orderBy: { attemptNumber: "desc" }, include: attemptInclude,
    });
    if (!attempt) throw new AppError(messages.attempt.notExist, 404);
    return finalizeAttempt(attempt, transaction);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 });
  return res.status(200).json({ message: messages.attempt.fetchedSuccessfully, success: true, data: formatAttempt(attempt, true) });
};

export const getAttempts = async (req, res) => {
  const { assessmentId, studentId, status, page, limit } = req.validatedQuery;
  const result = await prisma.$transaction(async (transaction) => {
    const assessment = await transaction.assessment.findUnique({ where: { id: assessmentId } });
    if (!assessment) throw new AppError(messages.assessment.notExist, 404);
    await assertAssessmentManager(req.authUser, assessment.teacherId, transaction);
    const where = { assessmentId, ...(studentId && { studentId }), ...(status && { status }) };
    if (status === attemptStatuses.IN_PROGRESS) {
      const now = new Date();
      where.AND = [
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        { assessment: { is: { status: assessmentStatuses.PUBLISHED, OR: [{ closesAt: null }, { closesAt: { gt: now } }] } } },
      ];
    }
    const total = await transaction.assessmentAttempt.count({ where });
    const attempts = await transaction.assessmentAttempt.findMany({
      where, orderBy: [{ startedAt: "desc" }, { id: "desc" }], skip: (page - 1) * limit, take: limit, include: attemptInclude,
    });
    const data = [];
    for (const attempt of attempts) data.push(await finalizeAttempt(attempt, transaction));
    return { data, total };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 });
  return res.status(200).json({ message: messages.attempt.fetchedSuccessfully, success: true, count: result.total, data: result.data, pagination: { page, limit, total: result.total, pages: Math.ceil(result.total / limit) } });
};
