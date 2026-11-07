import joi from "joi";

// Shared Joi rules reused by request validators.
const objectId = joi.string().hex().length(24);

export const generalFields = {
  objectId,
  name: joi.string().trim().max(255),
  email: joi.string().email().max(320),
  phone: joi.string().trim().max(64),
  dateTime: joi.string().pattern(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/
  ).custom((value, helpers) => {
    if (!Number.isFinite(Date.parse(value))) return helpers.error("any.invalid");
    const [year, month, day] = value.slice(0, 10).split("-").map(Number);
    const calendar = new Date(Date.UTC(year, month - 1, day));
    if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day) return helpers.error("any.invalid");
    return value;
  }),
  password: joi.string().pattern(
    new RegExp(
      /^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?[0-9])(?=.*?[#?!@$%^&*-]).{8,}$/
    )
  ).custom((value, helpers) => Buffer.byteLength(value, "utf8") <= 72 ? value : helpers.error("any.invalid")),
  secondPhone: joi.string().trim().max(64),
  bio: joi.string().trim().max(1000),
  offerings: joi.array().items(
    joi.object({
      trackId: objectId.required(),
      subjectId: objectId.required(),
    })
  ).min(1),
  page: joi.number().integer().min(1),
  limit: joi.number().integer().min(1).max(100),
  isActive: joi.boolean(),
  price: joi.number().integer().min(1).max(2147483647),
  lessonCount: joi.number().integer().min(1).max(2147483647),
  commissionPercentage: joi.number().min(0).max(100).precision(2),
};
