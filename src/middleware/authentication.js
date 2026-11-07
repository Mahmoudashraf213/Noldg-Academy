import { AppError } from "../utils/appError.js";
import { messages } from "../utils/constant/messages.js";
import { verifyToken } from "../utils/token.js";
import { Device, User } from "../../db/index.js";
import { deviceStatuses, userStatuses } from "../utils/constant/enum.js";

// Verify the access token and attach the active account to the request.
export const isAuthenticated = () => {
  return async (req, res, next) => {

    const { token } = req.headers;

    if (!token) {
      return next(new AppError(messages.auth.tokenMissing, 401));
    }

    const payload = verifyToken(token);

    if (payload.message) {
      return next(new AppError(payload.message, 401));
    }

    if (payload.tokenType !== "access") {
      return next(new AppError(messages.user.invalidCredentials, 401));
    }

    if (!payload.deviceId) {
      return next(new AppError(messages.auth.deviceIdMismatch, 401));
    }

    const authUser = await User.findFirst({
      where: { id: payload._id, isVerified: true },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        isVerified: true,
        status: true,
        sessionVersion: true,
        activeDeviceId: true,
        activeSessionExpiresAt: true,
        roles: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!authUser) {
      return next(new AppError(messages.user.notExist, 404));
    }

    if (authUser.status !== userStatuses.ACTIVE) {
      return next(new AppError(messages.user.accountSuspended, 403));
    }

    if (authUser.sessionVersion !== payload.sessionVersion) {
      return next(new AppError(messages.user.invalidCredentials, 401));
    }

    if (
      authUser.activeDeviceId !== payload.deviceId ||
      (authUser.activeSessionExpiresAt
        ? authUser.activeSessionExpiresAt <= new Date()
        : payload.exp !== undefined || process.env.ACCESS_TOKEN_TTL !== "none")
    ) {
      return next(new AppError(messages.auth.deviceIdMismatch, 401));
    }

    const device = await Device.findFirst({
      where: {
        userId: authUser.id,
        deviceId: payload.deviceId,
        status: deviceStatuses.ACTIVE,
      },
    });

    if (!device) {
      return next(new AppError(messages.auth.deviceIdMismatch, 401));
    }

    req.authUser = { ...authUser, _id: authUser.id };

    next();
  };
};
