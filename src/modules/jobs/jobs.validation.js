import joi from "joi";

export const jobParamsSchema = joi.object({
  task: joi.string().valid("video", "attempts", "notifications", "media", "recovery", "security").required(),
});
