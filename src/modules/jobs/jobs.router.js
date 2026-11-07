import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler.js";
import { isValid } from "../../middleware/vaildation.js";
import { runJob } from "./jobs.controller.js";
import { jobParamsSchema } from "./jobs.validation.js";

const jobsRouter = Router();

jobsRouter.get("/:task", isValid(jobParamsSchema, "params"), asyncHandler(runJob));

export default jobsRouter;
