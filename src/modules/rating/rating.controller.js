import { Prisma } from "@prisma/client";
import { prisma } from "../../../db/index.js";
import { AppError } from "../../utils/appError.js";
import { messages } from "../../utils/constant/messages.js";
import { orderStatuses, roles, teacherApprovalStatuses, userStatuses } from "../../utils/constant/enum.js";
import { fanoutNotification, notificationManagers } from "../notification/notification.utils.js";

const assertRatingTeacher = async (teacherId, transaction) => {
  const profile = await transaction.teacherProfile.findFirst({
    where: {
      userId: teacherId,
      approvalStatus: teacherApprovalStatuses.APPROVED,
      user: { is: { roles: roles.TEACHER, status: userStatuses.ACTIVE } },
    },
    select: { id: true },
  });
  if (!profile) throw new AppError(messages.teacher.profileNotFound, 404);
};

// An approved purchase qualifies the student; a complimentary entitlement does not.
export const saveRating = async (req, res) => {
  const { teacherId } = req.validatedParams;
  const studentId = req.authUser.id;
  const rating = await prisma.$transaction(async (transaction) => {
    await assertRatingTeacher(teacherId, transaction);
    const purchase = await transaction.order.findFirst({
      where: { studentId, teacherId, status: orderStatuses.APPROVED },
      select: { id: true },
    });
    if (!purchase) throw new AppError(messages.rating.purchaseRequired, 403);
    const existing = await transaction.teacherRating.findUnique({ where: { studentId_teacherId: { studentId, teacherId } } });
    const stars = req.body.stars;
    const comment = req.body.comment ?? existing?.comment ?? "";
    if (existing && existing.stars === stars && existing.comment === comment) return existing;
    const saved = await transaction.teacherRating.upsert({
      where: { studentId_teacherId: { studentId, teacherId } },
      create: { studentId, teacherId, stars, comment },
      update: { stars, comment },
    });
    await fanoutNotification({
      userIds: [teacherId], managerRoles: notificationManagers,
      type: existing ? "teacher_rating_updated" : "teacher_rated",
      title: existing ? "Teacher rating updated" : "New teacher rating",
      body: `${stars}/5${comment ? `: ${comment}` : ""}`,
      entityId: teacherId, eventKey: `teacher_rating:${saved.id}:${saved.updatedAt.toISOString()}`,
    }, transaction);
    return saved;
  }, { maxWait: 15000, timeout: 60000 });
  return res.status(200).json({ message: messages.rating.updated, success: true, data: rating });
};

// Public reviews expose the student's name without contact or session details.
export const getTeacherRatings = async (req, res) => {
  const { teacherId } = req.validatedParams;
  const { page, limit } = req.validatedQuery;
  const result = await prisma.$transaction(async (transaction) => {
    await assertRatingTeacher(teacherId, transaction);
    const where = { teacherId };
    const [ratings, summary] = await Promise.all([
      transaction.teacherRating.findMany({
        where,
        select: { id: true, stars: true, comment: true, createdAt: true, updatedAt: true, student: { select: { name: true } } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      transaction.teacherRating.aggregate({ where, _avg: { stars: true }, _count: { _all: true } }),
    ]);
    return { ratings, total: summary._count._all, averageStars: Number((summary._avg.stars ?? 0).toFixed(2)) };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 15000, timeout: 60000 });
  return res.status(200).json({
    message: messages.rating.fetchedSuccessfully,
    success: true,
    count: result.total,
    data: result.ratings,
    summary: { averageStars: result.averageStars, totalRatings: result.total },
    pagination: { page, limit, total: result.total, pages: Math.ceil(result.total / limit) },
  });
};
