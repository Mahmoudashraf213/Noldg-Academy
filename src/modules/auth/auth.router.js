import { Router } from "express";
import { rateLimit, loginAccountKey } from "../../middleware/rate-limit.js";
import { forgotPassword, resetPassword } from "./password-reset.controller.js";
import { AppError } from "../../utils/appError.js";
import { messages } from "../../utils/constant/messages.js";
import { isAuthenticated } from "../../middleware/authentication.js";
import { isValid } from "../../middleware/vaildation.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import {
  loginSchema,
  registerSchema,
  updateUserSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "./auth.validation.js";
import {
  getUserProfile,
  login,
  logout,
  register,
  updateUserProfile,
} from "./auth.controller.js";

const authRouter = Router();

// Close public account creation through an environment setting when needed.
const allowPublicRegistration = (req, res, next) => {
  if (process.env.ALLOW_PUBLIC_REGISTRATION === "false") {
    return next(new AppError(messages.user.registrationClosed, 403));
  }

  next();
};

// Public authentication routes.
authRouter.post(
  "/register",
  rateLimit({ scope: "registration", limit: 5, windowMs: 3600000 }),
  allowPublicRegistration,
  isValid(registerSchema),
  asyncHandler(register)
);

authRouter.post("/login", rateLimit({ scope: "login-ip", limit: 30, windowMs: 900000 }), isValid(loginSchema), rateLimit({ scope: "login-account", limit: 10, windowMs: 900000, key: loginAccountKey }), asyncHandler(login));

authRouter.post(
  "/forgot-password",
  rateLimit({ scope: "forgot-ip", limit: 10, windowMs: 900000 }),
  isValid(forgotPasswordSchema),
  rateLimit({ scope: "forgot-account", limit: 5, windowMs: 900000, key: loginAccountKey }),
  asyncHandler(forgotPassword)
);
authRouter.post(
  "/reset-password",
  rateLimit({ scope: "reset-ip", limit: 20, windowMs: 900000 }),
  isValid(resetPasswordSchema),
  rateLimit({ scope: "reset-account", limit: 10, windowMs: 900000, key: loginAccountKey }),
  asyncHandler(resetPassword)
);

// Authenticated account routes.
authRouter.post("/logout", isAuthenticated(), asyncHandler(logout));

authRouter.get("/", isAuthenticated(), asyncHandler(getUserProfile));

authRouter.put(
  "/update",
  isAuthenticated(),
  isValid(updateUserSchema),
  asyncHandler(updateUserProfile)
);

export default authRouter;
