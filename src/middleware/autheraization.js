import { AppError } from "../utils/appError.js"
import { messages } from "../utils/constant/messages.js"

// Allow the request only when the authenticated account has an accepted role.
export const isAuthorized = (roles = []) => {
  return (req, res, next) => {

    if (!roles.includes(req.authUser.roles)) {
      return next(new AppError(messages.user.unauthorized, 403));
    }

    next();
  };
};
