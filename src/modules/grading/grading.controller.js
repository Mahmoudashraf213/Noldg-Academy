import { Prisma } from "@prisma/client";
import { fanoutNotification } from "../notification/notification.utils.js";
import { prisma } from "../../../db/index.js";
import { AppError } from "../../utils/appError.js";
import { messages } from "../../utils/constant/messages.js";
import { attemptStatuses, questionTypes } from "../../utils/constant/enum.js";
import { attemptInclude, finalizeAttempt, loadAccessibleAttempt } from "../attempt/attempt.utils.js";

// Manual essay grading can be completed in parts without publishing a provisional total.
export const gradeAttempt = async (req, res) => {
  const attempt = await prisma.$transaction(async (transaction) => {
    let attempt = await loadAccessibleAttempt(req.validatedParams.attemptId, req.authUser, transaction);
    attempt = await finalizeAttempt(attempt, transaction);
    if (attempt.status === attemptStatuses.IN_PROGRESS) throw new AppError(messages.attempt.notSubmitted, 409);
    const now = new Date();
    for (const grade of req.body.grades) {
      const answer = attempt.answers.find((row) => row.assessmentQuestionId === grade.assessmentQuestionId);
      if (!answer || answer.question.type !== questionTypes.ESSAY || grade.pointsAwarded > answer.question.points) {
        throw new AppError(messages.attempt.invalidGrade, 400);
      }
      await transaction.assessmentAnswer.update({
        where: { id: answer.id },
        data: { pointsAwarded: grade.pointsAwarded, feedback: grade.feedback ?? "", gradedBy: req.authUser.id, gradedAt: now },
      });
    }
    const answers = await transaction.assessmentAnswer.findMany({ where: { attemptId: attempt.id } });
    const complete = answers.every((answer) => answer.pointsAwarded !== null);
    const score = complete ? Number(answers.reduce((sum, answer) => sum + answer.pointsAwarded, 0).toFixed(2)) : null;
    await transaction.assessmentAttempt.update({
      where: { id: attempt.id },
      data: { status: complete ? attemptStatuses.GRADED : attemptStatuses.SUBMITTED, score, gradedAt: complete ? now : null },
    });
    if (complete && (attempt.status !== attemptStatuses.GRADED || attempt.score !== score)) await fanoutNotification({
      userIds: [attempt.studentId], type: "attempt_graded", title: "Assessment result available", body: attempt.assessment.title,
      entityId: attempt.id, eventKey: `attempt_graded:${attempt.id}:${now.toISOString()}`,
    }, transaction);
    return transaction.assessmentAttempt.findUnique({ where: { id: attempt.id }, include: attemptInclude });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 });
  return res.status(200).json({ message: messages.attempt.graded, success: true, data: attempt });
};
