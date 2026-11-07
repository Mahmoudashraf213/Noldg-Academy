import { randomUUID } from "crypto";
import { fanoutNotification, notificationManagers } from "../notification/notification.utils.js";
import { Order, Product, prisma } from "../../../db/index.js";
import { AppError } from "../../utils/appError.js";
import { messages } from "../../utils/constant/messages.js";
import {
  orderStatuses,
  roles,
  teacherApprovalStatuses,
  userStatuses,
} from "../../utils/constant/enum.js";
import {
  calculateProductPricing,
  createProductPriceSnapshot,
} from "../product/product.utils.js";

// Create a single-product purchase and notify every active account manager.
export const createOrder = async (req, res, next) => {
  const studentId = req.authUser.roles === roles.STUDENT
    ? req.authUser.id
    : req.body.studentId;
  const product = await Product.findFirst({
    where: { id: req.body.productId, isActive: true },
    include: {
      course: {
        select: {
          teacherId: true,
          teacher: {
            select: { roles: true, status: true, teacherProfile: true },
          },
        },
      },
    },
  });

  if (!product) {
    return next(new AppError(messages.product.notFound, 404));
  }

  const teacher = product.course.teacher;
  if (
    teacher.roles !== roles.TEACHER ||
    teacher.status !== userStatuses.ACTIVE ||
    teacher.teacherProfile?.approvalStatus !== teacherApprovalStatuses.APPROVED
  ) {
    return next(new AppError(messages.order.notPurchasable, 409));
  }

  const now = new Date();
  const pricing = await calculateProductPricing(product, now);
  if (!pricing.isPurchasable || !Number.isSafeInteger(pricing.currentPrice) || pricing.currentPrice < 1) {
    return next(new AppError(messages.order.notPurchasable, 409));
  }

  const snapshot = await createProductPriceSnapshot(product, now, pricing);
  const order = await prisma.$transaction(async (transaction) => {
    const student = await transaction.user.findFirst({
      where: { id: studentId, roles: roles.STUDENT, status: userStatuses.ACTIVE },
      select: { id: true },
    });
    if (!student) {
      throw new AppError(messages.order.studentNotActive, 409);
    }

    const access = await transaction.productAccess.findUnique({
      where: { studentId_productId: { studentId, productId: product.id } },
    });
    if (access) {
      throw new AppError(messages.order.alreadyPurchased, 409);
    }

    const existingOrder = await transaction.order.findFirst({
      where: {
        studentId,
        productId: product.id,
        status: { not: orderStatuses.REJECTED },
      },
      select: { id: true },
    });
    if (existingOrder) {
      throw new AppError(messages.order.pendingOrderExists, 409);
    }

    const order = await transaction.order.create({
      data: {
        ...snapshot,
        studentId,
        teacherId: product.course.teacherId,
        createdBy: req.authUser.id,
        referenceNumber: `ORD-${randomUUID()}`,
        productName: product.name,
        productType: product.type,
      },
    });
    const managers = await transaction.user.findMany({
      where: {
        roles: { in: [roles.ADMIN, roles.SUPER_ADMIN] },
        status: userStatuses.ACTIVE,
      },
      select: { id: true },
    });
    if (managers.length) {
      await transaction.orderNotification.createMany({
        data: managers.map(({ id }) => ({ orderId: order.id, userId: id })),
      });
    }

    await fanoutNotification({
      userIds: [studentId, order.teacherId], managerRoles: notificationManagers,
      type: "order_created", title: "New purchase order", body: `Order ${order.referenceNumber}: ${order.productName}`,
      entityId: order.id, eventKey: `order_created:${order.id}`,
    }, transaction);
    return order;
  });

  return res.status(201).json({
    message: messages.order.created,
    success: true,
    data: order,
  });
};

// Return purchase history to its student or the account management queue.
export const getOrders = async (req, res) => {
  const { page, limit, status, referenceNumber, studentId, teacherId } = req.validatedQuery;
  const where = {
    ...(status && { status }),
    ...(referenceNumber && { referenceNumber }),
    ...(req.authUser.roles === roles.STUDENT
      ? { studentId: req.authUser.id }
      : { ...(studentId && { studentId }), ...(teacherId && { teacherId }) }),
  };
  const [orders, total] = await Promise.all([
    Order.findMany({
      where,
      include: {
        payment: true,
        approval: true,
        student: { select: { id: true, name: true, email: true, phone: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    Order.count({ where }),
  ]);

  return res.status(200).json({
    message: messages.order.fetchedSuccessfully,
    success: true,
    count: total,
    data: orders,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
};

// Return the checkout details and payment state without exposing other students' orders.
export const getOrderById = async (req, res, next) => {
  const order = await Order.findFirst({
    where: {
      id: req.validatedParams.orderId,
      ...(req.authUser.roles === roles.STUDENT && { studentId: req.authUser.id }),
    },
    include: {
      payment: true,
      approval: true,
      student: { select: { id: true, name: true, email: true, phone: true } },
    },
  });
  if (!order) {
    return next(new AppError(messages.order.notExist, 404));
  }

  return res.status(200).json({
    message: messages.order.fetchedSuccessfully,
    success: true,
    data: order,
  });
};
