import { AppError } from "../utils/appError.js";
import { messages } from "../utils/constant/messages.js";

// Forward rejected controller promises to the central error handler.
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next))
      .catch((err) => {
        if (err instanceof AppError) {
          return next(err);
        }

        if (err.code === 11000 || err.code === "P2002") {
          return next(new AppError(messages.error.duplicateRecord, 409));
        }

        if (err.code === "P2003") return next(new AppError(messages.error.relatedRecords, 409));
        if (["P2000", "P2006", "P2007", "P2020"].includes(err.code)) return next(new AppError(messages.error.invalidRequest, 400));

        if (err.name === "ValidationError") {
          return next(new AppError(messages.error.invalidRequest, 400));
        }

        if (err.code === "P2034") {
          if (["/api/assessments", "/api/attempts", "/api/grading"].includes(req.baseUrl)) {
            return next(new AppError(messages.assessment.conflict, 409));
          }
          if (req.baseUrl === "/api/questions") {
            return next(new AppError(messages.question.updateConflict, 409));
          }
          return next(new AppError(req.baseUrl === "/api/learning" ? messages.learning.sequenceConflict : messages.ledger.transactionConflict, 409));
        }

        console.error(messages.error.internal, err.message);
        next(new AppError(messages.error.internal, 500));
      });
  };
};
