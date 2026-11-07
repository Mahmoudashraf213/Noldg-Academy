import joi from "joi";
import { generalFields } from "../../utils/generalFields.js";
import { productTypes } from "../../utils/constant/enum.js";

// Validate a product identifier in product-specific routes.
export const productIdParamsSchema = joi.object({
  productId: generalFields.objectId.required(),
});

// Validate a teacher account identifier in commission management routes.
export const teacherIdParamsSchema = joi.object({
  teacherId: generalFields.objectId.required(),
});

// Validate a lesson or package product created by an approved teacher.
export const createProductSchema = joi.object({
  courseId: generalFields.objectId.required(),
  type: joi.string().valid(...Object.values(productTypes)).required(),
  lessonId: generalFields.objectId.when("type", {
    is: productTypes.LESSON,
    then: generalFields.objectId.required(),
    otherwise: generalFields.objectId.forbidden(),
  }),
  name: generalFields.name.when("type", {
    is: productTypes.PACKAGE,
    then: generalFields.name.required(),
    otherwise: generalFields.name.forbidden(),
  }),
  price: generalFields.price.required(),
  announcedLessonCount: generalFields.lessonCount.when("type", {
    is: productTypes.PACKAGE,
    then: generalFields.lessonCount.required(),
    otherwise: generalFields.lessonCount.forbidden(),
  }),
});

// Validate edits to a product's display name, price, package size, or activity.
export const updateProductSchema = joi.object({
  name: generalFields.name.optional(),
  price: generalFields.price.optional(),
  announcedLessonCount: generalFields.lessonCount.optional(),
  isActive: generalFields.isActive.optional(),
}).min(1);

// Restrict platform commission changes to a valid percentage.
export const updateCommissionSchema = joi.object({
  commissionPercentage: generalFields.commissionPercentage.required(),
});

// Allow the super admin to set a custom rate or restore the platform default.
export const updateTeacherCommissionSchema = joi.object({
  commissionPercentage: generalFields.commissionPercentage.allow(null).required(),
});
