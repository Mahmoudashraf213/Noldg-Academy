import { Router } from "express";
import { isAuthenticated } from "../../middleware/authentication.js";
import { isAuthorized } from "../../middleware/autheraization.js";
import { isValid } from "../../middleware/vaildation.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { roles } from "../../utils/constant/enum.js";
import { submitPayment } from "./payment.controller.js";
import { submitPaymentSchema } from "./payment.validation.js";

const paymentRouter = Router();

// Students and account managers may submit a manual payment for an order.
paymentRouter.post(
  "/",
  isAuthenticated(),
  isAuthorized([roles.STUDENT, roles.ADMIN, roles.SUPER_ADMIN]),
  isValid(submitPaymentSchema),
  asyncHandler(submitPayment)
);

export default paymentRouter;
