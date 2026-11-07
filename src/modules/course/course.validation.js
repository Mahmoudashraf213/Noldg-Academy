import joi from "joi";
import { generalFields } from "../../utils/generalFields.js";

// Validate a course identifier in teacher course routes.
export const courseIdParamsSchema = joi.object({
  courseId: generalFields.objectId.required(),
});
