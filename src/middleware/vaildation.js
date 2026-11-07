import joi from "joi";
import { AppError } from "../utils/appError.js";
import { messages } from "../utils/constant/messages.js";

// Validate one request section and keep Joi's normalized values for the handler.
export const isValid = (schema, source = "body") => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[source] ?? {}, { abortEarly: false });
    if (error) {
      return next(new AppError(messages.error.invalidRequest, 400));
    }
    if (source === "body") {
      req.body = value;
    } else {
      req[`validated${source[0].toUpperCase()}${source.slice(1)}`] = value;
    }
    next();
  };
};
