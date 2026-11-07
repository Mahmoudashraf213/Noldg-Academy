import { Router } from "express";
import { isAuthenticated } from "../../middleware/authentication.js";
import { isAuthorized } from "../../middleware/autheraization.js";
import { isValid } from "../../middleware/vaildation.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { roles } from "../../utils/constant/enum.js";
import { createGrant, getEntitlements } from "./entitlement.controller.js";
import {
  createGrantSchema,
  getEntitlementsSchema,
  getMyEntitlementsSchema,
} from "./entitlement.validation.js";

const entitlementRouter = Router();
const isAccountManager = isAuthorized([roles.ADMIN, roles.SUPER_ADMIN]);

// Account managers may grant either a lesson or a package to an active student.
entitlementRouter.post(
  "/grants",
  isAuthenticated(),
  isAccountManager,
  isValid(createGrantSchema),
  asyncHandler(createGrant)
);

// Students see their paid purchases and individually granted products.
entitlementRouter.get(
  "/my",
  isAuthenticated(),
  isAuthorized([roles.STUDENT]),
  isValid(getMyEntitlementsSchema, "query"),
  asyncHandler(getEntitlements)
);

// Account managers can filter entitlement records by student, product, or source.
entitlementRouter.get(
  "/",
  isAuthenticated(),
  isAccountManager,
  isValid(getEntitlementsSchema, "query"),
  asyncHandler(getEntitlements)
);

export default entitlementRouter;
