import { prisma } from "../../../db/index.js";
import { messages } from "../../utils/constant/messages.js";
import { productTypes, roles, userStatuses } from "../../utils/constant/enum.js";

// Persist one inbox row per recipient in the caller's business transaction.
export const fanoutNotification = async ({ userIds = [], managerRoles = [], type, title, body, entityId, eventKey }, transaction = prisma) => {
  const where = {
    OR: [{ id: { in: userIds.filter(Boolean) } }, ...(managerRoles.length ? [{ roles: { in: managerRoles }, status: userStatuses.ACTIVE }] : [])],
  };
  let cursor;
  while (true) {
    const users = await transaction.user.findMany({ where: { ...where, ...(cursor && { id: { gt: cursor } }) }, select: { id: true }, orderBy: { id: "asc" }, take: 500 });
    if (!users.length) break;
    await transaction.notification.createMany({
      data: users.map(({ id }) => ({ userId: id, type, title, body, entityId, eventKey })),
      skipDuplicates: true,
    });
    if (users.length < 500) break;
    cursor = users.at(-1).id;
  }
};

// Exams target package owners; lesson content targets package and lesson owners.
const courseStudentWhere = ({ courseId, lessonId, packagesOnly = false, isFree = false }) => ({
  roles: roles.STUDENT,
  status: userStatuses.ACTIVE,
  ...(!isFree && {
    studentProductAccess: { some: { product: { is: {
      courseId,
      OR: [{ type: productTypes.PACKAGE }, ...(!packagesOnly ? [{ type: productTypes.LESSON, ...(lessonId && { lessonId }) }] : [])],
    } } } },
  }),
});

// Persist large audiences as an outbox job in the business transaction.
export const notifyCourseStudents = async ({ courseId, lessonId, packagesOnly = false, isFree = false, ...event }, transaction = prisma) => {
  const course = await transaction.course.findUnique({ where: { id: courseId }, select: { teacherId: true } });
  await fanoutNotification({ ...event, userIds: [course?.teacherId], managerRoles: notificationManagers }, transaction);
  await transaction.notificationFanout.upsert({
    where: { eventKey: event.eventKey }, update: {},
    create: { eventKey: event.eventKey, nextAttemptAt: new Date(0), payload: JSON.parse(JSON.stringify({ courseId, lessonId, packagesOnly, isFree, ...event })) },
  });
};

export const processNotificationFanout = async () => {
  let taskId;
  let attempts = 0;
  try {
    await prisma.$transaction(async (transaction) => {
      const tasks = await transaction.$queryRaw`SELECT "id" FROM "notification_fanouts" WHERE "status" = 'pending' AND "nextAttemptAt" <= NOW() ORDER BY "createdAt" LIMIT 1 FOR UPDATE SKIP LOCKED`;
      if (!tasks.length) return;
      taskId = tasks[0].id;
      const task = await transaction.notificationFanout.findUnique({ where: { id: taskId } });
      attempts = task.attempts;
      const users = await transaction.user.findMany({
        where: { ...courseStudentWhere(task.payload), ...(task.cursor && { id: { gt: task.cursor } }) },
        select: { id: true }, orderBy: { id: "asc" }, take: 500,
      });
      const { type, title, body, entityId, eventKey } = task.payload;
      if (users.length) await transaction.notification.createMany({ data: users.map(({ id }) => ({ userId: id, type, title, body, entityId, eventKey })), skipDuplicates: true });
      await transaction.notificationFanout.update({ where: { id: taskId }, data: { cursor: users.at(-1)?.id ?? task.cursor, status: users.length < 500 ? "completed" : "pending", attempts: 0 } });
    });
  } catch (error) {
    if (taskId) await prisma.notificationFanout.updateMany({ where: { id: taskId, status: "pending" }, data: { attempts: { increment: 1 }, status: attempts >= 9 ? "failed" : "pending", nextAttemptAt: new Date(Date.now() + Math.min(3600000, 5000 * 2 ** attempts)) } }).catch(() => {});
    console.error(messages.notification.fanoutFailed, taskId || "database", error.code || error.name);
  }
};

export const startNotificationFanout = () => {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try { for (let index = 0; index < 10; index++) await processNotificationFanout(); } finally { running = false; }
  };
  run();
  const interval = setInterval(run, 5000);
  interval.unref();
};

export const notificationManagers = [roles.ADMIN, roles.SUPER_ADMIN];

export const getNotificationInbox = async (userId, { page = 1, limit = 20, unread, type } = {}) => {
  const where = { userId, ...(type && { type }), ...(unread !== undefined && { readAt: unread ? null : { not: null } }) };
  const [data, total, unreadCount] = await prisma.$transaction([
    prisma.notification.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * limit, take: limit }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ], { isolationLevel: "RepeatableRead" });
  return { count: total, data, unreadCount, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
};
