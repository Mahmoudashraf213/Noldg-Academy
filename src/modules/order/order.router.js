import { Router } from "express";
import { isAuthenticated } from "../../middleware/authentication.js";
import { isAuthorized } from "../../middleware/autheraization.js";
import { isValid } from "../../middleware/vaildation.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { roles } from "../../utils/constant/enum.js";
import { createOrder, getOrderById, getOrders } from "./order.controller.js";
import {
  createManualOrderSchema,
  createOrderSchema,
  getMyOrdersSchema,
  getOrdersSchema,
  orderIdParamsSchema,
} from "./order.validation.js";

const orderRouter = Router();
const isAccountManager = isAuthorized([roles.ADMIN, roles.SUPER_ADMIN]);

// Let students create and view their own single-product purchases.
orderRouter.post(
  "/",
  isAuthenticated(),
  isAuthorized([roles.STUDENT]),
  isValid(createOrderSchema),
  asyncHandler(createOrder)
);
orderRouter.get(
  "/my",
  isAuthenticated(),
  isAuthorized([roles.STUDENT]),
  isValid(getMyOrdersSchema, "query"),
  asyncHandler(getOrders)
);

// Let account managers create manual orders and inspect the purchase queue.
orderRouter.post(
  "/manual",
  isAuthenticated(),
  isAccountManager,
  isValid(createManualOrderSchema),
  asyncHandler(createOrder)
);
orderRouter.get(
  "/",
  isAuthenticated(),
  isAccountManager,
  isValid(getOrdersSchema, "query"),
  asyncHandler(getOrders)
);
orderRouter.get(
  "/:orderId",
  isAuthenticated(),
  isAuthorized([roles.STUDENT, roles.ADMIN, roles.SUPER_ADMIN]),
  isValid(orderIdParamsSchema, "params"),
  asyncHandler(getOrderById)
);

export default orderRouter;
