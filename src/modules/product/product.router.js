import { Router } from "express";
import { isAuthenticated } from "../../middleware/authentication.js";
import { isAuthorized } from "../../middleware/autheraization.js";
import { isValid } from "../../middleware/vaildation.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { roles } from "../../utils/constant/enum.js";
import {
  createProduct,
  getMyProducts,
  getPlatformCommission,
  getProductPricing,
  getTeacherCommission,
  updatePlatformCommission,
  updateTeacherCommission,
  updateProduct,
} from "./product.controller.js";
import {
  createProductSchema,
  productIdParamsSchema,
  teacherIdParamsSchema,
  updateCommissionSchema,
  updateTeacherCommissionSchema,
  updateProductSchema,
} from "./product.validation.js";

const productRouter = Router();

// Read and update the platform commission as a super admin.
productRouter.get(
  "/platform-settings/commission",
  isAuthenticated(),
  isAuthorized([roles.SUPER_ADMIN]),
  asyncHandler(getPlatformCommission)
);
productRouter.patch(
  "/platform-settings/commission",
  isAuthenticated(),
  isAuthorized([roles.SUPER_ADMIN]),
  isValid(updateCommissionSchema),
  asyncHandler(updatePlatformCommission)
);
productRouter.get(
  "/teachers/:teacherId/commission",
  isAuthenticated(),
  isAuthorized([roles.SUPER_ADMIN]),
  isValid(teacherIdParamsSchema, "params"),
  asyncHandler(getTeacherCommission)
);
productRouter.patch(
  "/teachers/:teacherId/commission",
  isAuthenticated(),
  isAuthorized([roles.SUPER_ADMIN]),
  isValid(teacherIdParamsSchema, "params"),
  isValid(updateTeacherCommissionSchema),
  asyncHandler(updateTeacherCommission)
);

// Let approved teachers manage and inspect their own products.
productRouter.post(
  "/",
  isAuthenticated(),
  isAuthorized([roles.TEACHER]),
  isValid(createProductSchema),
  asyncHandler(createProduct)
);
productRouter.get(
  "/my",
  isAuthenticated(),
  isAuthorized([roles.TEACHER]),
  asyncHandler(getMyProducts)
);
productRouter.patch(
  "/:productId",
  isAuthenticated(),
  isAuthorized([roles.TEACHER]),
  isValid(productIdParamsSchema, "params"),
  isValid(updateProductSchema),
  asyncHandler(updateProduct)
);

// Show the current product price and commission breakdown.
productRouter.get(
  "/:productId/pricing",
  isValid(productIdParamsSchema, "params"),
  asyncHandler(getProductPricing)
);

export default productRouter;
