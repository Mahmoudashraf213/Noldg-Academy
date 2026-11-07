import { Router } from "express";
import { isAuthenticated } from "../../middleware/authentication.js";
import { isAuthorized } from "../../middleware/autheraization.js";
import { isValid } from "../../middleware/vaildation.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { roles } from "../../utils/constant/enum.js";
import { getSettings, updateSettings } from "./settings.controller.js";
import { updateSettingsSchema } from "./settings.validation.js";

const settingsRouter = Router();

settingsRouter.get("/", asyncHandler(getSettings));
settingsRouter.patch(
  "/",
  isAuthenticated(),
  isAuthorized([roles.SUPER_ADMIN]),
  isValid(updateSettingsSchema),
  asyncHandler(updateSettings)
);

export default settingsRouter;
