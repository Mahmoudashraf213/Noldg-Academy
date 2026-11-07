import { Prisma } from "@prisma/client";
import { fanoutNotification, notificationManagers, notifyCourseStudents } from "../notification/notification.utils.js";
import { prisma } from "../../../db/index.js";
import { AppError } from "../../utils/appError.js";
import { messages } from "../../utils/constant/messages.js";
import { assessmentStatuses, assessmentTypes, attemptStatuses, questionTypes, roles } from "../../utils/constant/enum.js";
import { assertAssessmentManager } from "../assessment/assessment.utils.js";
import { validateAttemptAnswer } from "./attempt.validation.js";

export const attemptInclude = {
  assessment: { include: { lesson: true } },
  answers: { include: { question: true }, orderBy: { question: { position: "asc" } } },
};

export const getAttemptDeadline = (attempt) => {
  const dates = [attempt.expiresAt, attempt.assessment.closesAt,
    attempt.assessment.status === assessmentStatuses.CLOSED ? attempt.assessment.closedAt : null];
  return dates.filter(Boolean).sort((left, right) => left - right)[0] ?? null;
};

export const objectiveAnswerMatches = (type, answer, correctAnswer) => {
  if (type === questionTypes.MULTIPLE_CHOICE) {
    return Array.isArray(answer) && answer.length === correctAnswer.length
      && correctAnswer.every((index) => answer.includes(index));
  }
  return answer !== null && answer === correctAnswer;
};

// Finalization is shared by explicit submission, late requests, and the cleanup worker.
export const finalizeAttempt = async (attempt, transaction, now = new Date(), manual = false) => {
  if (attempt.status !== attemptStatuses.IN_PROGRESS) return attempt;
  const deadline = getAttemptDeadline(attempt);
  const closed = attempt.assessment.status === assessmentStatuses.CLOSED;
  if (!manual && !closed && (!deadline || deadline > now)) return attempt;
  const timedOut = deadline && deadline <= now;
  const submittedAt = timedOut ? deadline : now;
  const timedDeadline = [attempt.expiresAt, attempt.assessment.closesAt].filter(Boolean).sort((left, right) => left - right)[0];
  const manuallyClosed = closed && attempt.assessment.closedAt && (!timedDeadline || attempt.assessment.closedAt < timedDeadline);
  const submissionReason = manuallyClosed ? "assessment_closed" : timedOut ? "timeout" : "manual";
  const lock = await transaction.assessmentAttempt.updateMany({
    where: { id: attempt.id, status: attemptStatuses.IN_PROGRESS, lastSequence: attempt.lastSequence },
    data: { status: attemptStatuses.SUBMITTED, submittedAt, submissionReason },
  });
  if (!lock.count) throw new AppError(messages.assessment.conflict, 409);
  let autoScore = 0;
  let pending = false;
  for (const answer of attempt.answers) {
    const essay = answer.question.type === questionTypes.ESSAY;
    const needsGrading = essay && typeof answer.answer === "string" && answer.answer.trim().length > 0;
    const pointsAwarded = needsGrading ? null : !essay && objectiveAnswerMatches(answer.question.type, answer.answer, answer.question.correctAnswer) ? answer.question.points : 0;
    if (needsGrading) pending = true;
    if (!essay) autoScore += pointsAwarded;
    await transaction.assessmentAnswer.update({
      where: { id: answer.id },
      data: { pointsAwarded, gradedAt: needsGrading ? null : now },
    });
  }
  autoScore = Number(autoScore.toFixed(2));
  await transaction.assessmentAttempt.update({
    where: { id: attempt.id },
    data: { autoScore, ...(pending ? {} : { status: attemptStatuses.GRADED, score: autoScore, gradedAt: now }) },
  });
  await fanoutNotification({
    userIds: [attempt.studentId, attempt.assessment.teacherId], managerRoles: notificationManagers,
    type: "attempt_submitted", title: "Assessment submitted", body: attempt.assessment.title,
    entityId: attempt.id, eventKey: `attempt_submitted:${attempt.id}`,
  }, transaction);
  if (!pending) await fanoutNotification({
    userIds: [attempt.studentId], type: "attempt_graded", title: "Assessment result available", body: attempt.assessment.title,
    entityId: attempt.id, eventKey: `attempt_graded:${attempt.id}`,
  }, transaction);
  return transaction.assessmentAttempt.findUnique({ where: { id: attempt.id }, include: attemptInclude });
};

export const loadAccessibleAttempt = async (attemptId, authUser, transaction) => {
  const attempt = await transaction.assessmentAttempt.findUnique({ where: { id: attemptId }, include: attemptInclude });
  if (!attempt) throw new AppError(messages.attempt.notExist, 404);
  if (authUser.roles === roles.STUDENT) {
    if (attempt.studentId !== authUser.id) throw new AppError(messages.attempt.notExist, 404);
    const latest = await transaction.assessmentAttempt.findFirst({
      where: { assessmentId: attempt.assessmentId, studentId: authUser.id }, orderBy: { attemptNumber: "desc" }, select: { id: true },
    });
    if (latest.id !== attempt.id) throw new AppError(messages.attempt.notExist, 404);
  } else await assertAssessmentManager(authUser, attempt.assessment.teacherId, transaction);
  return attempt;
};

// Save partial answers monotonically so a delayed autosave cannot overwrite newer input.
export const saveAttemptAnswers = async (attempt, body, transaction) => {
  if (body.sequence !== attempt.lastSequence + 1) throw new AppError(messages.attempt.sequenceConflict, 409);
  const changes = body.answers.map((item) => {
    const row = attempt.answers.find((answer) => answer.assessmentQuestionId === item.assessmentQuestionId);
    if (!row) throw new AppError(messages.error.invalidRequest, 400);
    const { error, value } = validateAttemptAnswer(row.question, item.answer);
    if (error) throw new AppError(messages.error.invalidRequest, 400);
    return { id: row.id, answer: value ?? Prisma.DbNull };
  });
  const lock = await transaction.assessmentAttempt.updateMany({
    where: { id: attempt.id, status: attemptStatuses.IN_PROGRESS, lastSequence: attempt.lastSequence },
    data: { lastSequence: body.sequence },
  });
  if (!lock.count) throw new AppError(messages.attempt.sequenceConflict, 409);
  for (const change of changes) await transaction.assessmentAnswer.update({ where: { id: change.id }, data: { answer: change.answer } });
  return transaction.assessmentAttempt.findUnique({ where: { id: attempt.id }, include: attemptInclude });
};

// Students receive only their latest attempt, with no answer keys or provisional scores.
export const formatAttempt = (attempt, student = false) => {
  if (!student) return attempt;
  const graded = attempt.status === attemptStatuses.GRADED;
  return {
    id: attempt.id, assessmentId: attempt.assessmentId, attemptNumber: attempt.attemptNumber,
    status: attempt.status, lastSequence: attempt.lastSequence, totalPoints: attempt.totalPoints,
    score: graded ? attempt.score : null, startedAt: attempt.startedAt, expiresAt: getAttemptDeadline(attempt),
    submittedAt: attempt.submittedAt, gradedAt: attempt.gradedAt, submissionReason: attempt.submissionReason,
    assessment: { id: attempt.assessment.id, title: attempt.assessment.title, type: attempt.assessment.type, courseId: attempt.assessment.courseId, lessonId: attempt.assessment.lessonId },
    answers: attempt.answers.map((answer) => ({
      assessmentQuestionId: answer.assessmentQuestionId,
      question: { id: answer.question.id, position: answer.question.position, text: answer.question.text, type: answer.question.type, options: answer.question.options, points: answer.question.points },
      answer: answer.answer, pointsAwarded: graded ? answer.pointsAwarded : null, feedback: graded ? answer.feedback : "",
    })),
  };
};

// A periodic pass completes saved answers even when the student closes the browser.
export const cleanupExpiredAssessmentAttempts = async () => {
  const now = new Date();
  try {
    await prisma.$transaction(async (transaction) => {
      const closed = await transaction.assessment.updateManyAndReturn({
        where: { status: assessmentStatuses.PUBLISHED, closesAt: { lte: now } },
        data: { status: assessmentStatuses.CLOSED, closedAt: now },
      });
      for (const assessment of closed) {
        const lesson = assessment.lessonId ? await transaction.lesson.findUnique({ where: { id: assessment.lessonId } }) : null;
        await notifyCourseStudents({
          courseId: assessment.courseId, lessonId: assessment.lessonId, packagesOnly: assessment.type === assessmentTypes.EXAM, isFree: assessment.type !== assessmentTypes.EXAM && Boolean(lesson?.isFree),
          type: "assessment_closed", title: "Assessment closed", body: assessment.title,
          entityId: assessment.id, eventKey: `assessment_closed:${assessment.id}`,
        }, transaction);
      }
    }, { maxWait: 15000, timeout: 60000 });
  } catch (error) {
    console.error(messages.assessment.cleanupFailed, "assessment closure", error.code || error.name);
  }
  let cursor;
  while (true) {
    const attempts = await prisma.assessmentAttempt.findMany({
      where: {
        status: attemptStatuses.IN_PROGRESS,
        AND: [
          { OR: [{ expiresAt: { lte: now } }, { assessment: { is: { status: assessmentStatuses.CLOSED } } }] },
          ...(cursor ? [{ OR: [{ startedAt: { gt: cursor.startedAt } }, { startedAt: cursor.startedAt, id: { gt: cursor.id } }] }] : []),
        ],
      },
      select: { id: true, startedAt: true }, take: 50, orderBy: [{ startedAt: "asc" }, { id: "asc" }],
    });
    for (const { id } of attempts) {
      try {
        await prisma.$transaction(async (transaction) => {
          const attempt = await transaction.assessmentAttempt.findUnique({ where: { id }, include: attemptInclude });
          if (attempt) await finalizeAttempt(attempt, transaction);
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 15000, timeout: 60000 });
      } catch (error) {
        if (error.code !== "P2034" && !(error instanceof AppError && error.statusCode === 409)) {
          console.error(messages.assessment.cleanupFailed, id, error.code || error.name);
        }
      }
    }
    if (attempts.length < 50) break;
    cursor = attempts.at(-1);
  }
};

export const startAssessmentAttemptCleanup = () => {
  let running = false;
  const runCleanup = () => {
    if (running) return;
    running = true;
    cleanupExpiredAssessmentAttempts().catch((error) => {
      console.error(messages.assessment.cleanupFailed, error.message);
    }).finally(() => { running = false; });
  };
  runCleanup();
  const interval = setInterval(runCleanup, 15000);
  interval.unref();
};
