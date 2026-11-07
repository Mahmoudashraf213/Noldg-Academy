import bcrypt from "bcrypt";
import { fanoutNotification, notificationManagers } from "../notification/notification.utils.js";
import { AppError } from "../../utils/appError.js";
import { messages } from "../../utils/constant/messages.js";
import { generateToken, verifyToken } from "../../utils/token.js";
import { Device, User, prisma } from "../../../db/index.js";
import { deviceStatuses, userStatuses } from "../../utils/constant/enum.js";
import { getClientDeviceInfo, getDeviceLimit } from "../user/device.utils.js";

// Remove credentials and session secrets before returning an account to the client.
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

// Create an access token using the configured session lifetime.
const createToken = (user, deviceId) => {
  const payload = {
    _id: user.id,
    email: user.email,
    sessionVersion: user.sessionVersion,
    deviceId,
  };

  return generateToken({ payload: { ...payload, tokenType: "access" } });
};

// Register a new user.
export const register = async (req, res, next) => {
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
  const user = await prisma.$transaction(async (transaction) => {
    const created = await transaction.user.create({
      data: {
        name: trimmedName,
        email: normalizedEmail,
        phone,
        password: hashedPassword,
      },
    });
    await fanoutNotification({
      userIds: [created.id], managerRoles: notificationManagers,
      type: "account_created", title: "Student account created", body: created.name,
      entityId: created.id, eventKey: `account_created:${created.id}`,
    }, transaction);
    return created;
  });

  return res.status(201).json({
    message: messages.user.accountCreated,
    success: true,
    data: publicUser(user),
  });
};

// Log in with a name or email and password.
export const login = async (req, res, next) => {
  const { name, email, password } = req.body;
  const { deviceId, ipAddress, userAgent } = getClientDeviceInfo(req);

  if ((!name && !email) || (name && email)) {
    return next(new AppError(messages.auth.loginIdentifierRequired, 400));
  }

  const user = await User.findFirst({
    where: email
      ? { email: email.trim().toLowerCase() }
      : { name: name.trim() },
  });

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return next(new AppError(messages.user.invalidCredentials, 401));
  }

  if (user.status !== userStatuses.ACTIVE) {
    return next(new AppError(messages.user.accountSuspended, 403));
  }

  const now = new Date();
  const hasActiveSession =
    user.activeDeviceId &&
    (!user.activeSessionExpiresAt || user.activeSessionExpiresAt > now);
  if (hasActiveSession && user.activeDeviceId !== deviceId) {
    return next(new AppError(messages.auth.accountOpenOnAnotherDevice, 409));
  }

  const activeDevice = await Device.findFirst({
    where: {
      userId: user.id,
      deviceId,
      status: deviceStatuses.ACTIVE,
    },
  });

  if (
    !hasActiveSession &&
    user.activeDeviceId &&
    user.activeDeviceId !== deviceId
  ) {
    await Device.updateMany({
      where: {
        userId: user.id,
        deviceId: user.activeDeviceId,
        status: deviceStatuses.ACTIVE,
      },
      data: { status: deviceStatuses.INACTIVE },
    });
  }

  if (!activeDevice) {
    const registeredDeviceCount = await Device.count({
      where: { userId: user.id, status: deviceStatuses.ACTIVE },
    });

    if (registeredDeviceCount >= getDeviceLimit()) {
      return next(new AppError(messages.auth.deviceLimitReached, 409));
    }
  }

  const nextSessionVersion = user.sessionVersion + 1;
  const token = createToken(
    { ...user, sessionVersion: nextSessionVersion },
    deviceId
  );
  const tokenPayload = verifyToken(token);
  const activeSessionExpiresAt = tokenPayload.exp === undefined
    ? null
    : new Date(tokenPayload.exp * 1000);

  const activeUser = await prisma.$transaction(async (transaction) => {
    const sessionUpdate = await transaction.user.updateMany({
      where: {
        id: user.id,
        status: userStatuses.ACTIVE,
        sessionVersion: user.sessionVersion,
        OR: [
          { activeDeviceId: deviceId },
          { activeSessionExpiresAt: { lte: now } },
          { activeSessionExpiresAt: null },
        ],
      },
      data: {
        sessionVersion: { increment: 1 },
        activeDeviceId: deviceId,
        activeSessionExpiresAt,
      },
    });

    if (sessionUpdate.count !== 1) return false;

    await transaction.device.upsert({
      where: { userId_deviceId: { userId: user.id, deviceId } },
      update: {
        ipAddress,
        userAgent,
        status: deviceStatuses.ACTIVE,
        lastSeenAt: now,
      },
      create: {
        userId: user.id,
        deviceId,
        ipAddress,
        userAgent,
        status: deviceStatuses.ACTIVE,
        lastSeenAt: now,
      },
    });

    return true;
  });

  if (!activeUser) {
    return next(new AppError(messages.auth.accountOpenOnAnotherDevice, 409));
  }

  return res.status(200).json({
    message: messages.user.loginSuccess,
    success: true,
    token,
  });
};

// Log out and invalidate the current session.
export const logout = async (req, res) => {
  await prisma.$transaction([
    Device.updateMany({
      where: {
        userId: req.authUser.id,
        deviceId: req.authUser.activeDeviceId,
        status: deviceStatuses.ACTIVE,
      },
      data: { status: deviceStatuses.INACTIVE },
    }),
    User.update({
      where: { id: req.authUser.id },
      data: {
        sessionVersion: { increment: 1 },
        activeDeviceId: null,
        activeSessionExpiresAt: null,
      },
    }),
  ]);

  return res.status(200).json({
    message: messages.user.logoutSuccess,
    success: true,
  });
};

// Get the authenticated user's profile.
export const getUserProfile = async (req, res, next) => {
  const user = await User.findUnique({ where: { id: req.authUser.id } });

  if (!user) {
    return next(new AppError(messages.user.notExist, 404));
  }

  return res.status(200).json({
    message: messages.user.fetchedSuccessfully,
    success: true,
    data: publicUser(user),
  });
};

// Update the authenticated user's profile.
export const updateUserProfile = async (req, res, next) => {
  const { name, email, phone } = req.body;
  const user = await User.findUnique({ where: { id: req.authUser.id } });

  if (!user) {
    return next(new AppError(messages.user.notExist, 404));
  }

  const normalizedEmail = email?.trim().toLowerCase();
  if (normalizedEmail && normalizedEmail !== user.email) {
    const emailExists = await User.findUnique({ where: { email: normalizedEmail } });
    if (emailExists) {
      return next(new AppError(messages.user.emailTaken, 409));
    }
  }

  const trimmedName = name?.trim();
  if (trimmedName && trimmedName !== user.name) {
    const nameExists = await User.findFirst({
      where: { name: trimmedName, id: { not: user.id } },
    });
    if (nameExists) {
      return next(new AppError(messages.user.nameTaken, 409));
    }
  }

  const updatedUser = await User.update({
    where: { id: user.id },
    data: {
      ...(trimmedName && { name: trimmedName }),
      ...(normalizedEmail && { email: normalizedEmail }),
      ...(phone && { phone }),
    },
  });

  return res.status(200).json({
    message: messages.user.updated,
    success: true,
    data: publicUser(updatedUser),
  });
};
