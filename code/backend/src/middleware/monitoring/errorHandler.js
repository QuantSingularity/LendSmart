const { logger } = require("../../utils/logger");
const { logSystemEvent } = require("../../compliance/auditLogger");

const auditLogger = { logSystemEvent };

class AppError extends Error {
  constructor(
    message,
    statusCode = 500,
    code = "INTERNAL_SERVER_ERROR",
    details = null,
  ) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Enhanced Error Handling Middleware
 * Provides comprehensive error handling, logging, and response formatting
 */

class ErrorHandler {
  constructor() {
    this.errorCodes = {
      // Authentication & Authorization
      UNAUTHORIZED: { status: 401, message: "Authentication required" },
      FORBIDDEN: { status: 403, message: "Access denied" },
      TOKEN_EXPIRED: { status: 401, message: "Token has expired" },
      INVALID_TOKEN: { status: 401, message: "Invalid token provided" },
      ACCOUNT_LOCKED: { status: 423, message: "Account is temporarily locked" },

      // Validation
      VALIDATION_ERROR: { status: 400, message: "Validation failed" },
      INVALID_INPUT: { status: 400, message: "Invalid input provided" },
      MISSING_REQUIRED_FIELD: {
        status: 400,
        message: "Required field is missing",
      },
      INVALID_FORMAT: { status: 400, message: "Invalid data format" },

      // Business Logic
      INSUFFICIENT_FUNDS: { status: 400, message: "Insufficient funds" },
      LOAN_NOT_FOUND: { status: 404, message: "Loan not found" },
      USER_NOT_FOUND: { status: 404, message: "User not found" },
      DUPLICATE_ENTRY: { status: 409, message: "Resource already exists" },
      BUSINESS_RULE_VIOLATION: {
        status: 422,
        message: "Business rule violation",
      },

      // External Services
      PAYMENT_PROCESSOR_ERROR: {
        status: 502,
        message: "Payment processing failed",
      },
      CREDIT_BUREAU_ERROR: {
        status: 502,
        message: "Credit bureau service unavailable",
      },
      BLOCKCHAIN_ERROR: { status: 502, message: "Blockchain service error" },
      EXTERNAL_SERVICE_TIMEOUT: {
        status: 504,
        message: "External service timeout",
      },

      // System Errors
      DATABASE_ERROR: { status: 500, message: "Database operation failed" },
      CACHE_ERROR: { status: 500, message: "Cache operation failed" },
      FILE_SYSTEM_ERROR: { status: 500, message: "File system error" },
      CONFIGURATION_ERROR: {
        status: 500,
        message: "System configuration error",
      },

      // Rate Limiting
      RATE_LIMIT_EXCEEDED: { status: 429, message: "Rate limit exceeded" },

      // Generic
      INTERNAL_SERVER_ERROR: { status: 500, message: "Internal server error" },
      NOT_FOUND: { status: 404, message: "Resource not found" },
      METHOD_NOT_ALLOWED: { status: 405, message: "Method not allowed" },
      UNSUPPORTED_MEDIA_TYPE: {
        status: 415,
        message: "Unsupported media type",
      },
    };
  }

  /**
   * Create a standardized error object
   */
  createError(code, details = null, cause = null) {
    const errorInfo =
      this.errorCodes[code] || this.errorCodes.INTERNAL_SERVER_ERROR;

    const error = new Error(errorInfo.message);
    error.code = code;
    error.status = errorInfo.status;
    error.details = details;
    error.cause = cause;
    error.timestamp = new Date().toISOString();
    error.isOperational = true; // Mark as operational error

    return error;
  }

  /**
   * Main error handling middleware
   */
  handleError(error, req, res, next) {
    // Generate unique error ID for tracking
    const errorId = this.generateErrorId();

    // Extract request context
    const context = {
      errorId,
      method: req.method,
      url: req.originalUrl || req.url,
      userAgent: req.get("User-Agent"),
      ipAddress: req.ip || req.connection?.remoteAddress,
      userId: req.user?.id || req.user?._id || null,
      requestId: req.id || req.headers["x-request-id"],
      timestamp: new Date().toISOString(),
    };

    // Determine error type and status
    const errorResponse = this.processError(error, context);

    // Log the error
    this.logError(error, context, errorResponse);

    // Send response
    res.status(errorResponse.status).json({
      error: {
        id: errorId,
        code: errorResponse.code,
        message: errorResponse.message,
        ...(errorResponse.details && { details: errorResponse.details }),
        timestamp: context.timestamp,
        ...(process.env.NODE_ENV === "development" && {
          stack: error.stack,
          cause: error.cause,
        }),
      },
    });
  }

  /**
   * Process error and determine response
   */
  processError(error, context) {
    // Handle known operational errors
    if (error.isOperational && error.code) {
      return {
        status: error.status || 500,
        code: error.code,
        message: error.message,
        details: error.details,
      };
    }

    // Handle Mongoose validation errors
    if (error.name === "ValidationError") {
      return {
        status: 400,
        code: "VALIDATION_ERROR",
        message: "Validation failed",
        details: this.formatValidationErrors(error.errors),
      };
    }

    // Handle Mongoose cast errors
    if (error.name === "CastError") {
      return {
        status: 400,
        code: "INVALID_FORMAT",
        message: `Invalid ${error.path}: ${error.value}`,
        details: { field: error.path, value: error.value },
      };
    }

    // Handle MongoDB duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || "field";
      return {
        status: 409,
        code: "DUPLICATE_ENTRY",
        message: `${field} already exists`,
        details: { field, value: error.keyValue?.[field] },
      };
    }

    // Handle JWT errors
    if (error.name === "JsonWebTokenError") {
      return {
        status: 401,
        code: "INVALID_TOKEN",
        message: "Invalid token provided",
      };
    }

    if (error.name === "TokenExpiredError") {
      return {
        status: 401,
        code: "TOKEN_EXPIRED",
        message: "Token has expired",
      };
    }

    // Handle syntax errors (malformed JSON, etc.)
    if (
      error instanceof SyntaxError &&
      error.status === 400 &&
      "body" in error
    ) {
      return {
        status: 400,
        code: "INVALID_FORMAT",
        message: "Invalid JSON format",
      };
    }

    // Handle rate limiting errors
    if (error.status === 429) {
      return {
        status: 429,
        code: "RATE_LIMIT_EXCEEDED",
        message: "Rate limit exceeded",
        details: {
          retryAfter: error.retryAfter || 60,
          limit: error.limit,
          remaining: error.remaining,
        },
      };
    }

    // Handle file upload errors
    if (error.code === "LIMIT_FILE_SIZE") {
      return {
        status: 413,
        code: "FILE_TOO_LARGE",
        message: "File size exceeds limit",
        details: { limit: error.limit },
      };
    }

    // Default to internal server error
    return {
      status: 500,
      code: "INTERNAL_SERVER_ERROR",
      message:
        process.env.NODE_ENV === "production"
          ? "An unexpected error occurred"
          : error.message,
    };
  }

  /**
   * Format Mongoose validation errors
   */
  formatValidationErrors(errors) {
    const formatted = {};

    for (const field in errors) {
      const error = errors[field];
      formatted[field] = {
        message: error.message,
        value: error.value,
        kind: error.kind,
      };
    }

    return formatted;
  }

  /**
   * Log error with appropriate level and context
   */
  logError(error, context, errorResponse) {
    const logData = {
      errorId: context.errorId,
      code: errorResponse.code,
      status: errorResponse.status,
      message: error.message,
      stack: error.stack,
      context: {
        method: context.method,
        url: context.url,
        userAgent: context.userAgent,
        ipAddress: context.ipAddress,
        userId: context.userId,
        requestId: context.requestId,
      },
      ...(error.details && { details: error.details }),
      ...(error.cause && { cause: error.cause }),
    };

    // Determine log level based on error severity
    if (errorResponse.status >= 500) {
      logger.error("Server error occurred", logData);

      // Log critical errors to audit log
      auditLogger.logSystemEvent("critical_error", {
        errorId: context.errorId,
        code: errorResponse.code,
        message: error.message,
        userId: context.userId,
        ipAddress: context.ipAddress,
      });
    } else if (errorResponse.status >= 400) {
      logger.warn("Client error occurred", logData);

      // Log security-related errors
      if (
        [
          "UNAUTHORIZED",
          "FORBIDDEN",
          "TOKEN_EXPIRED",
          "INVALID_TOKEN",
        ].includes(errorResponse.code)
      ) {
        logger.security.accessDenied(
          context.userId,
          context.url,
          context.method,
          context.ipAddress,
          context.userAgent,
          errorResponse.code,
        );
      }
    } else {
      logger.info("Request completed with error", logData);
    }
  }

  /**
   * Generate unique error ID
   */
  generateErrorId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `err_${timestamp}_${random}`;
  }

  /**
   * Handle 404 errors
   */
  handleNotFound(req, res, next) {
    const error = this.createError("NOT_FOUND", {
      resource: req.originalUrl || req.url,
      method: req.method,
    });

    next(error);
  }

  /**
   * Handle async errors
   */
  asyncHandler(fn) {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  /**
   * Graceful shutdown handler
   */
  handleShutdown(signal) {
    logger.info(`Received ${signal}, starting graceful shutdown...`);

    // Close server gracefully
    if (global.server) {
      global.server.close((err) => {
        if (err) {
          logger.error("Error during server shutdown", { error: err.message });
          process.exit(1);
        }

        logger.info("Server closed successfully");
        process.exit(0);
      });

      // Force shutdown after timeout
      setTimeout(() => {
        logger.error("Forced shutdown due to timeout");
        process.exit(1);
      }, 10000); // 10 seconds
    } else {
      process.exit(0);
    }
  }

  /**
   * Handle uncaught exceptions
   */
  handleUncaughtException(error) {
    logger.error("Uncaught exception occurred", {
      error: error.message,
      stack: error.stack,
    });

    auditLogger.logSystemEvent("uncaught_exception", {
      error: error.message,
      stack: error.stack,
    });

    // Graceful shutdown
    process.exit(1);
  }

  /**
   * Handle unhandled promise rejections
   */
  handleUnhandledRejection(reason, promise) {
    logger.error("Unhandled promise rejection", {
      reason: reason?.message || reason,
      stack: reason?.stack,
    });

    auditLogger.logSystemEvent("unhandled_rejection", {
      reason: reason?.message || reason,
      stack: reason?.stack,
    });

    // Graceful shutdown
    process.exit(1);
  }

  /**
   * Setup global error handlers
   */
  setupGlobalHandlers() {
    // Handle uncaught exceptions
    process.on("uncaughtException", this.handleUncaughtException.bind(this));

    // Handle unhandled promise rejections
    process.on("unhandledRejection", this.handleUnhandledRejection.bind(this));

    // Handle graceful shutdown signals
    process.on("SIGTERM", () => this.handleShutdown("SIGTERM"));
    process.on("SIGINT", () => this.handleShutdown("SIGINT"));

    logger.info("Global error handlers registered");
  }
}

// Create singleton instance
const errorHandler = new ErrorHandler();

// Export middleware functions
module.exports = {
  AppError,
  errorHandler,
  handleError: errorHandler.handleError.bind(errorHandler),
  handleNotFound: errorHandler.handleNotFound.bind(errorHandler),
  asyncHandler: errorHandler.asyncHandler.bind(errorHandler),
  createError: errorHandler.createError.bind(errorHandler),
  setupGlobalHandlers: errorHandler.setupGlobalHandlers.bind(errorHandler),
};
