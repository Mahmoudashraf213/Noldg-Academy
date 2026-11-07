import { messages } from "./constant/messages.js";

// Attach an HTTP status code to an application error.
export class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode || 500;
        this.success = false;
    }
}

// Convert application and unexpected errors into the standard API response.
export const globalErrorHandling = async (err, req, res, next) => {
    if (res.headersSent) return next(err);
    const bodyStatuses = { "entity.too.large": 413, "encoding.unsupported": 415, "entity.parse.failed": 400, "request.aborted": 400, "request.size.invalid": 400 };
    const statusCode = err instanceof AppError ? err.statusCode : bodyStatuses[err.type] || (err.name === "MulterError" ? err.code === "LIMIT_FILE_SIZE" ? 413 : 400 : err.status === 400 ? 400 : 500);
    const message = err instanceof AppError
        ? err.message
        : statusCode < 500
          ? messages.error.invalidRequest
          : messages.error.internal;

    return res.status(statusCode).json({
        message,
        success: false
    });
}
