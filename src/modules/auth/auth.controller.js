import bcrypt from "bcrypt";
import { fanoutNotification, notificationManagers } from "../notification/notification.utils.js";
import { AppError } from "../../utils/appError.js";
import { messages } from "../../utils/constant/messages.js";
import { generateToken, verifyToken } from "../../utils/token.js";
import { User, prisma } from "../../../db/index.js";
import { deviceStatuses, userStatuses } from "../../utils/constant/enum.js";
import { getClientDeviceInfo } from "../user/device.utils.js";

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

  const token = await prisma.$transaction(async (transaction) => {
    // Serialize logins so only the latest session remains valid.
    await transaction.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${user.id} FOR UPDATE`;
    const currentUser = await transaction.user.findUnique({ where: { id: user.id } });
    if (!currentUser || currentUser.password !== user.password) {
      throw new AppError(messages.user.invalidCredentials, 401);
    }
    if (currentUser.status !== userStatuses.ACTIVE) {
      throw new AppError(messages.user.accountSuspended, 403);
    }

    const now = new Date();
    const sessionToken = createToken(
      { ...currentUser, sessionVersion: currentUser.sessionVersion + 1 },
      deviceId
    );
    const tokenPayload = verifyToken(sessionToken);
    const activeSessionExpiresAt = tokenPayload.exp === undefined
      ? null
      : new Date(tokenPayload.exp * 1000);

    await transaction.user.update({
      where: { id: user.id },
      data: {
        sessionVersion: { increment: 1 },
        activeDeviceId: deviceId,
        activeSessionExpiresAt,
      },
    });

    await transaction.device.updateMany({
      where: { userId: user.id, status: deviceStatuses.ACTIVE },
      data: { status: deviceStatuses.INACTIVE },
    });

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

    return sessionToken;
  });

  return res.status(200).json({
    message: messages.user.loginSuccess,
    success: true,
    token,
  });
};

// Log out and invalidate the current session.
export const logout = async (req, res) => {
  await prisma.$transaction(async (transaction) => {
    // An old logout request must not invalidate a newer login.
    const sessionUpdate = await transaction.user.updateMany({
      where: {
        id: req.authUser.id,
        sessionVersion: req.authUser.sessionVersion,
        activeDeviceId: req.authUser.activeDeviceId,
      },
      data: {
        sessionVersion: { increment: 1 },
        activeDeviceId: null,
        activeSessionExpiresAt: null,
      },
    });
    if (sessionUpdate.count) await transaction.device.updateMany({
      where: {
        userId: req.authUser.id,
        deviceId: req.authUser.activeDeviceId,
        status: deviceStatuses.ACTIVE,
      },
      data: { status: deviceStatuses.INACTIVE },
    });
  });

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
