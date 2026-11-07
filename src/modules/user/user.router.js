import { Router } from "express";
import { isAuthenticated } from "../../middleware/authentication.js";
import { isAuthorized } from "../../middleware/autheraization.js";
import { isValid } from "../../middleware/vaildation.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { roles } from "../../utils/constant/enum.js";
import {
  createAdmin,
  getMyDevices,
  getUserById,
  getUsers,
  updateUserStatus,
} from "./user.controller.js";
import {
  createAdminSchema,
  getUsersSchema,
  updateUserStatusSchema,
  userIdSchema,
} from "./user.validation.js";

const userRouter = Router();
const isAccountManager = isAuthorized([roles.ADMIN, roles.SUPER_ADMIN]);

// Only the super admin can create admin accounts.
userRouter.post(
  "/admin",
  isAuthenticated(),
  isAuthorized([roles.SUPER_ADMIN]),
  isValid(createAdminSchema),
  asyncHandler(createAdmin)
);

// Let an authenticated user list their own registered devices.
userRouter.get("/devices", isAuthenticated(), asyncHandler(getMyDevices));

// Account managers can browse the paginated account list.
userRouter.get(
  "/",
  isAuthenticated(),
  isAccountManager,
  isValid(getUsersSchema, "query"),
  asyncHandler(getUsers)
);

// Account managers can inspect an individual account profile.
userRouter.get(
  "/:userId",
  isAuthenticated(),
  isAccountManager,
  isValid(userIdSchema, "params"),
  asyncHandler(getUserById)
);

// Account managers can suspend or reactivate an account.
userRouter.patch(
  "/:userId/status",
  isAuthenticated(),
  isAccountManager,
  isValid(userIdSchema, "params"),
  isValid(updateUserStatusSchema),
  asyncHandler(updateUserStatus)
);

export default userRouter;
