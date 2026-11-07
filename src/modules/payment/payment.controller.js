import { prisma } from "../../../db/index.js";
import { fanoutNotification, notificationManagers } from "../notification/notification.utils.js";
import { AppError } from "../../utils/appError.js";
import { messages } from "../../utils/constant/messages.js";
import { orderStatuses, roles, userStatuses } from "../../utils/constant/enum.js";

// Submit a manual payment for review without granting product access.
export const submitPayment = async (req, res) => {
  const payment = await prisma.$transaction(async (transaction) => {
    const order = await transaction.order.findFirst({
      where: {
        id: req.body.orderId,
        ...(req.authUser.roles === roles.STUDENT && { studentId: req.authUser.id }),
      },
    });
    if (!order) {
      throw new AppError(messages.order.notExist, 404);
    }
    if (order.status !== orderStatuses.PENDING_PAYMENT) {
      throw new AppError(messages.payment.orderNotPayable, 409);
    }

    const submission = await transaction.order.updateMany({
      where: { id: order.id, status: orderStatuses.PENDING_PAYMENT },
      data: { status: orderStatuses.PENDING_REVIEW },
    });
    if (!submission.count) {
      throw new AppError(messages.payment.alreadySubmitted, 409);
    }

    const payment = await transaction.payment.create({
      data: {
        orderId: order.id,
        submittedBy: req.authUser.id,
        amount: order.salePrice,
        notes: req.body.notes,
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
        skipDuplicates: true,
      });
    }
    await transaction.orderNotification.updateMany({
      where: { orderId: order.id },
      data: { readAt: null },
    });

    await fanoutNotification({
      userIds: [order.studentId, order.teacherId], managerRoles: notificationManagers,
      type: "payment_submitted", title: "Payment submitted for review", body: `Order ${order.referenceNumber}: ${order.productName}`,
      entityId: order.id, eventKey: `payment_submitted:${payment.id}`,
    }, transaction);
    return { ...payment, referenceNumber: order.referenceNumber };
  });

  return res.status(201).json({
    message: messages.payment.created,
    success: true,
    data: payment,
  });
};
