import { AppError } from "../../utils/appError.js";
import { fanoutNotification, notificationManagers } from "../notification/notification.utils.js";
import { messages } from "../../utils/constant/messages.js";
import {
  deviceStatuses,
  roles,
  userStatuses,
} from "../../utils/constant/enum.js";
import { Device, User, prisma } from "../../../db/index.js";
import bcrypt from "bcrypt";
import { Prisma } from "@prisma/client";
import { getDeviceLimit } from "./device.utils.js";

// Exclude secrets before returning account data from management routes.
const publicUser = (user) => {
  const {
    password,
    sessionVersion,
    activeDeviceId,
    activeSessionExpiresAt,
    ...userData
  } = user;
  return userData;
};

// List the authenticated user's registered devices.
export const getMyDevices = async (req, res) => {
  const devices = await Device.findMany({
    where: { userId: req.authUser.id },
    orderBy: { lastSeenAt: "desc" },
  });

  return res.status(200).json({
    message: messages.user.fetchedSuccessfully,
    success: true,
    count: devices.length,
    limit: getDeviceLimit(),
    data: devices,
  });
};

// Create an active admin account without exposing role selection to the request.
export const createAdmin = async (req, res, next) => {
  const { name, email, phone, password } = req.body;
  const normalizedEmail = email.trim().toLowerCase();
  const trimmedName = name.trim();
  const userExists = await User.findFirst({
    where: { OR: [{ email: normalizedEmail }, { name: trimmedName }] },
  });

  if (userExists) {
    return next(new AppError(messages.user.alreadyExist, 409));
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const admin = await prisma.$transaction(async (transaction) => {
    const created = await transaction.user.create({
      data: {
        name: trimmedName,
        email: normalizedEmail,
        phone,
        password: hashedPassword,
        roles: roles.ADMIN,
        status: userStatuses.ACTIVE,
        isVerified: true,
      },
    });
    await fanoutNotification({
      userIds: [created.id], managerRoles: [roles.SUPER_ADMIN],
      type: "account_created", title: "Admin account created", body: created.name,
      entityId: created.id, eventKey: `account_created:${created.id}`,
    }, transaction);
    return created;
  });

  return res.status(201).json({
    message: messages.user.accountCreated,
    success: true,
    data: publicUser(admin),
  });
};

// Get a paginated list of user accounts.
export const getUsers = async (req, res) => {
  const page = req.validatedQuery.page;
  const limit = req.validatedQuery.limit;
  const skip = (page - 1) * limit;
  const where = { roles: { notIn: [roles.ADMIN, roles.SUPER_ADMIN] } };
  const [users, total] = await Promise.all([
    User.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    User.count({ where }),
  ]);

  return res.status(200).json({
    message: messages.user.fetchedSuccessfully,
    success: true,
    count: total,
    data: users.map(publicUser),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
};

// Get one user's account and profile.
export const getUserById = async (req, res, next) => {
  const user = await User.findUnique({
    where: { id: req.validatedParams.userId },
  });

  if (!user) {
    return next(new AppError(messages.user.notExist, 404));
  }

  return res.status(200).json({
    message: messages.user.fetchedSuccessfully,
    success: true,
    data: publicUser(user),
  });
};

// Change a user's status and revoke the user's active session.
export const updateUserStatus = async (req, res, next) => {
  const { userId } = req.validatedParams;
  const { status } = req.body;
  const user = await User.findUnique({ where: { id: userId } });

  if (!user) {
    return next(new AppError(messages.user.notExist, 404));
  }

  // Only a super admin may manage another super admin account.
  if (user.roles === roles.SUPER_ADMIN && req.authUser.roles !== roles.SUPER_ADMIN) {
    return next(new AppError(messages.user.unauthorized, 403));
  }

  if (user.status === status) {
    return res.status(200).json({
      message: messages.user.updated,
      success: true,
      data: publicUser(user),
    });
  }

  // Update status and revoke existing access tokens atomically.
  const updatedUser = await prisma.$transaction(async (transaction) => {
    if (user.roles === roles.SUPER_ADMIN && status === userStatuses.SUSPENDED) {
      const activeSuperAdmins = await transaction.user.count({ where: { roles: roles.SUPER_ADMIN, status: userStatuses.ACTIVE } });
      if (activeSuperAdmins <= 1) throw new AppError(messages.user.lastSuperAdmin, 409);
    }
    const statusUpdate = await transaction.user.updateMany({
      where: { id: userId, status: user.status },
      data: {
        status,
        sessionVersion: { increment: 1 },
        activeDeviceId: null,
        activeSessionExpiresAt: null,
      },
    });

    if (statusUpdate.count !== 1) return null;

    await transaction.device.updateMany({
      where: { userId, status: deviceStatuses.ACTIVE },
      data: { status: deviceStatuses.INACTIVE },
    });

    await fanoutNotification({
      userIds: [userId], managerRoles: notificationManagers,
      type: "account_status_changed", title: "Account status changed", body: `${user.name}: ${status}`,
      entityId: userId, eventKey: `account_status:${userId}:${user.sessionVersion + 1}`,
    }, transaction);
    return transaction.user.findUnique({ where: { id: userId } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  if (!updatedUser) {
    return next(new AppError(messages.error.statusUpdateConflict, 409));
  }

  return res.status(200).json({
    message: messages.user.updated,
    success: true,
    data: publicUser(updatedUser),
  });
};
