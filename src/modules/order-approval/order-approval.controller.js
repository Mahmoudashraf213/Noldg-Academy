import { OrderNotification, prisma } from "../../../db/index.js";
import { fanoutNotification, notificationManagers } from "../notification/notification.utils.js";
import { AppError } from "../../utils/appError.js";
import { messages } from "../../utils/constant/messages.js";
import { orderStatuses, paymentStatuses, roles, userStatuses } from "../../utils/constant/enum.js";
import { grantProductAccess } from "../lesson/lesson-access.utils.js";
import { recordOrderSale } from "../ledger/ledger.utils.js";

// Finalize a paid order once and grant access in the same database transaction.
export const reviewOrder = async (req, res) => {
  const { status, reason } = req.body;
  const order = await prisma.$transaction(async (transaction) => {
    const order = await transaction.order.findUnique({
      where: { id: req.validatedParams.orderId },
      include: { payment: true },
    });
    if (!order) {
      throw new AppError(messages.order.notExist, 404);
    }
    if ([orderStatuses.APPROVED, orderStatuses.REJECTED].includes(order.status)) {
      throw new AppError(messages.order.alreadyReviewed, 409);
    }
    if (order.status !== orderStatuses.PENDING_REVIEW || order.payment?.status !== paymentStatuses.SUBMITTED) {
      throw new AppError(messages.order.paymentRequired, 409);
    }

    if (status === orderStatuses.APPROVED) {
      if (order.payment.amount !== order.salePrice) {
        throw new AppError(messages.ledger.paymentMismatch, 409);
      }
      const receivedBy = req.body.receivedBy || req.authUser.id;
      if (req.authUser.roles !== roles.SUPER_ADMIN && receivedBy !== req.authUser.id) {
        throw new AppError(messages.user.unauthorized, 403);
      }
      const receiver = await transaction.user.findFirst({
        where: {
          id: receivedBy,
          roles: { in: [roles.ADMIN, roles.SUPER_ADMIN] },
          status: userStatuses.ACTIVE,
        },
        select: { id: true },
      });
      if (!receiver) {
        throw new AppError(messages.ledger.receiverNotFound, 404);
      }
      const student = await transaction.user.findFirst({
        where: { id: order.studentId, roles: roles.STUDENT, status: userStatuses.ACTIVE },
        select: { id: true },
      });
      if (!student) {
        throw new AppError(messages.order.studentNotActive, 409);
      }
    }

    const review = await transaction.order.updateMany({
      where: { id: order.id, status: orderStatuses.PENDING_REVIEW },
      data: { status },
    });
    if (!review.count) {
      throw new AppError(messages.order.alreadyReviewed, 409);
    }

    const paymentUpdate = await transaction.payment.updateMany({
      where: { orderId: order.id, status: paymentStatuses.SUBMITTED },
      data: {
        status: status === orderStatuses.APPROVED
          ? paymentStatuses.CONFIRMED
          : paymentStatuses.REJECTED,
      },
    });
    if (!paymentUpdate.count) {
      throw new AppError(messages.order.paymentRequired, 409);
    }

    const reviewedAt = new Date();
    await transaction.orderApproval.create({
      data: { orderId: order.id, reviewedBy: req.authUser.id, status, reason, reviewedAt },
    });
    if (status === orderStatuses.APPROVED) {
      await recordOrderSale(order, {
        receivedBy: req.body.receivedBy || req.authUser.id,
        recordedBy: req.authUser.id,
        occurredAt: reviewedAt,
      }, transaction);
      await grantProductAccess({
        studentId: order.studentId,
        productId: order.productId,
        confirmedBy: req.authUser.id,
      }, transaction);
    }
    await transaction.orderNotification.updateMany({
      where: { orderId: order.id },
      data: { readAt: reviewedAt },
    });

    await fanoutNotification({
      userIds: [order.studentId, order.teacherId], managerRoles: notificationManagers,
      type: `order_${status}`, title: `Purchase ${status}`,
      body: `Order ${order.referenceNumber}: ${order.productName}${status === orderStatuses.REJECTED ? `. ${reason}` : ""}`,
      entityId: order.id, eventKey: `order_reviewed:${order.id}`,
    }, transaction);
    return transaction.order.findUnique({
      where: { id: order.id },
      include: { payment: true, approval: true },
    });
  });

  return res.status(200).json({
    message: status === orderStatuses.APPROVED ? messages.order.approved : messages.order.rejected,
    success: true,
    data: order,
  });
};

// List notifications addressed to the authenticated account manager only.
export const getOrderNotifications = async (req, res) => {
  const { page, limit, unread } = req.validatedQuery;
  const where = {
    userId: req.authUser.id,
    ...(unread !== undefined && { readAt: unread ? null : { not: null } }),
  };
  const [notifications, total] = await Promise.all([
    OrderNotification.findMany({
      where,
      include: {
        order: {
          select: {
            id: true,
            referenceNumber: true,
            productName: true,
            studentId: true,
            status: true,
            salePrice: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    OrderNotification.count({ where }),
  ]);

  return res.status(200).json({
    message: messages.order.notificationsFetched,
    success: true,
    count: total,
    data: notifications,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
};

// Mark a notification read without changing its order or another manager's inbox.
export const markOrderNotificationRead = async (req, res, next) => {
  const notification = await OrderNotification.updateMany({
    where: { id: req.validatedParams.notificationId, userId: req.authUser.id },
    data: { readAt: new Date() },
  });
  if (!notification.count) {
    return next(new AppError(messages.order.notificationNotFound, 404));
  }

  return res.status(200).json({
    message: messages.order.notificationRead,
    success: true,
  });
};
