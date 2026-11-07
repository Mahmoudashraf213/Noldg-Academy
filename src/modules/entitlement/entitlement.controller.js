import { ProductAccess, prisma } from "../../../db/index.js";
import { fanoutNotification, notificationManagers } from "../notification/notification.utils.js";
import { AppError } from "../../utils/appError.js";
import { messages } from "../../utils/constant/messages.js";
import { entitlementSources, roles, userStatuses } from "../../utils/constant/enum.js";

// Grant one lesson or package without creating an order, payment, or commission.
export const createGrant = async (req, res) => {
  const { studentId, productId, reason } = req.body;
  const entitlement = await prisma.$transaction(async (transaction) => {
    const student = await transaction.user.findFirst({
      where: { id: studentId, roles: roles.STUDENT, status: userStatuses.ACTIVE },
      select: { id: true },
    });
    if (!student) {
      throw new AppError(messages.order.studentNotActive, 409);
    }

    const product = await transaction.product.findFirst({
      where: { id: productId, isActive: true },
      select: { id: true, name: true, course: { select: { teacherId: true } } },
    });
    if (!product) {
      throw new AppError(messages.product.notFound, 404);
    }

    const access = await transaction.productAccess.findUnique({
      where: { studentId_productId: { studentId, productId } },
      select: { id: true },
    });
    if (access) {
      throw new AppError(messages.entitlement.alreadyGranted, 409);
    }

    const grant = await transaction.productAccess.create({
      data: {
        studentId,
        productId,
        source: entitlementSources.COMPLIMENTARY,
        confirmedBy: req.authUser.id,
        reason,
      },
    });
    await fanoutNotification({
      userIds: [studentId, product.course.teacherId], managerRoles: notificationManagers,
      type: "access_granted", title: "Complimentary access granted", body: product.name,
      entityId: grant.id, eventKey: `access_granted:${grant.id}`,
    }, transaction);
    return grant;
  });

  return res.status(201).json({
    message: messages.entitlement.granted,
    success: true,
    data: entitlement,
  });
};

// List paid and complimentary access while keeping students scoped to their own records.
export const getEntitlements = async (req, res) => {
  const { page, limit, source, studentId, productId } = req.validatedQuery;
  const where = {
    ...(source && { source }),
    ...(req.authUser.roles === roles.STUDENT
      ? { studentId: req.authUser.id }
      : { ...(studentId && { studentId }), ...(productId && { productId }) }),
  };
  const [entitlements, total] = await Promise.all([
    ProductAccess.findMany({
      where,
      include: {
        student: { select: { id: true, name: true, email: true } },
        product: { select: { id: true, courseId: true, lessonId: true, type: true, name: true, isActive: true } },
        confirmer: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    ProductAccess.count({ where }),
  ]);

  return res.status(200).json({
    message: messages.entitlement.fetchedSuccessfully,
    success: true,
    count: total,
    data: entitlements,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
};
