import { prisma } from "../../../db/index.js";
import { productTypes } from "../../utils/constant/enum.js";
import { isLessonAvailableAt } from "./lesson.utils.js";

// Check the lesson window before allowing a free lesson or a product entitlement.
export const hasLessonAccess = async (studentId, lesson, now = new Date(), transaction = prisma) => {
  if (!isLessonAvailableAt(lesson, now)) return false;
  if (lesson.isFree) return true;

  const products = await transaction.product.findMany({
    where: {
      courseId: lesson.courseId,
      OR: [
        { type: productTypes.LESSON, lessonId: lesson.id },
        { type: productTypes.PACKAGE },
      ],
    },
    select: { id: true },
  });
  const productIds = products.map(({ id }) => id);

  if (!productIds.length) return false;

  return Boolean(
    await transaction.productAccess.findFirst({
      where: { studentId, productId: { in: productIds } },
      select: { id: true },
    })
  );
};

// Create a product entitlement idempotently after a payment is confirmed.
export const grantProductAccess = async ({ studentId, productId, confirmedBy }, transaction = prisma) =>
  transaction.productAccess.upsert({
    where: { studentId_productId: { studentId, productId } },
    update: {},
    create: { studentId, productId, confirmedBy: confirmedBy ?? null },
  });
