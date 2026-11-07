import { Prisma } from "@prisma/client";
import { Question, User, prisma } from "../../../db/index.js";
import { AppError } from "../../utils/appError.js";
import { messages } from "../../utils/constant/messages.js";
import { questionTypes, roles, teacherApprovalStatuses } from "../../utils/constant/enum.js";
import { createQuestionSchema } from "./question.validation.js";

// Follow the existing requirement that teachers are approved before managing content.
const assertQuestionBankAccess = async (authUser, transaction = prisma) => {
  if (authUser.roles !== roles.TEACHER) return;
  const profile = await transaction.teacherProfile.findFirst({
    where: { userId: authUser.id, approvalStatus: teacherApprovalStatuses.APPROVED },
    select: { id: true },
  });
  if (!profile) throw new AppError(messages.teacher.approvalRequired, 403);
};

// Create in the teacher's own bank or let account managers select the owning teacher.
export const createQuestion = async (req, res, next) => {
  await assertQuestionBankAccess(req.authUser);
  const teacherId = req.authUser.roles === roles.TEACHER
    ? req.authUser.id
    : req.validatedParams.teacherId;
  const teacher = await User.findFirst({
    where: { id: teacherId, roles: roles.TEACHER },
    select: { id: true },
  });
  if (!teacher) return next(new AppError(messages.user.notExist, 404));
  const question = await Question.create({
    data: {
      teacherId,
      text: req.body.text,
      type: req.body.type,
      options: req.body.options ?? [],
      correctAnswer: req.body.correctAnswer ?? Prisma.DbNull,
    },
  });
  return res.status(201).json({ message: messages.question.created, success: true, data: question });
};

// Questions remain independent of courses and are scoped to their owning teacher.
export const getQuestions = async (req, res) => {
  await assertQuestionBankAccess(req.authUser);
  const { page, limit, type, teacherId } = req.validatedQuery;
  const where = {
    ...(type && { type }),
    ...(req.authUser.roles === roles.TEACHER
      ? { teacherId: req.authUser.id }
      : teacherId && { teacherId }),
  };
  const [questions, total] = await Promise.all([
    Question.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    Question.count({ where }),
  ]);
  return res.status(200).json({
    message: messages.question.fetchedSuccessfully,
    success: true,
    count: total,
    data: questions,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
};

export const getQuestionById = async (req, res, next) => {
  await assertQuestionBankAccess(req.authUser);
  const question = await Question.findFirst({
    where: {
      id: req.validatedParams.questionId,
      ...(req.authUser.roles === roles.TEACHER && { teacherId: req.authUser.id }),
    },
  });
  if (!question) return next(new AppError(messages.question.notExist, 404));
  return res.status(200).json({ message: messages.question.fetchedSuccessfully, success: true, data: question });
};

// Validate the final content atomically when options or question types are changed.
export const updateQuestion = async (req, res) => {
  const question = await prisma.$transaction(async (transaction) => {
    await assertQuestionBankAccess(req.authUser, transaction);
    const question = await transaction.question.findFirst({
      where: {
        id: req.validatedParams.questionId,
        ...(req.authUser.roles === roles.TEACHER && { teacherId: req.authUser.id }),
      },
    });
    if (!question) throw new AppError(messages.question.notExist, 404);
    const nextType = req.body.type ?? question.type;
    const candidate = { text: question.text, type: nextType };
    if (nextType === question.type) {
      if ([questionTypes.SINGLE_CHOICE, questionTypes.MULTIPLE_CHOICE].includes(nextType)) candidate.options = question.options;
      if (nextType !== questionTypes.ESSAY) candidate.correctAnswer = question.correctAnswer;
    }
    const { error, value } = createQuestionSchema.validate({ ...candidate, ...req.body }, { abortEarly: false });
    if (error) throw new AppError(messages.error.invalidRequest, 400);
    return transaction.question.update({
      where: { id: question.id },
      data: {
        text: value.text,
        type: value.type,
        options: value.options ?? [],
        correctAnswer: value.correctAnswer ?? Prisma.DbNull,
      },
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return res.status(200).json({ message: messages.question.updated, success: true, data: question });
};

export const deleteQuestion = async (req, res, next) => {
  await assertQuestionBankAccess(req.authUser);
  const deletion = await Question.deleteMany({
    where: {
      id: req.validatedParams.questionId,
      ...(req.authUser.roles === roles.TEACHER && { teacherId: req.authUser.id }),
    },
  });
  if (!deletion.count) return next(new AppError(messages.question.notExist, 404));
  return res.status(200).json({ message: messages.question.deleted, success: true });
};
