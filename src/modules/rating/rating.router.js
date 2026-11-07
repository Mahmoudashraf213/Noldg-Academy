import { Router } from "express";
import { isAuthenticated } from "../../middleware/authentication.js";
import { isAuthorized } from "../../middleware/autheraization.js";
import { isValid } from "../../middleware/vaildation.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { roles } from "../../utils/constant/enum.js";
import { getTeacherRatings, saveRating } from "./rating.controller.js";
import { getRatingsSchema, ratingTeacherParamsSchema, saveRatingSchema } from "./rating.validation.js";

const ratingRouter = Router();

ratingRouter.put(
  "/teachers/:teacherId",
  isAuthenticated(),
  isAuthorized([roles.STUDENT]),
  isValid(ratingTeacherParamsSchema, "params"),
  isValid(saveRatingSchema),
  asyncHandler(saveRating)
);
ratingRouter.get(
  "/teachers/:teacherId",
  isValid(ratingTeacherParamsSchema, "params"),
  isValid(getRatingsSchema, "query"),
  asyncHandler(getTeacherRatings)
);

export default ratingRouter;
