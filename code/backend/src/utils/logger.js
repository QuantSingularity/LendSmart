const winston = require("winston");
const path = require("path");
const fs = require("fs");

/**
 * Logging System
 * Implements structured logging with multiple transports and security features
 */

// Ensure logs directory exists
const logsDir = path.join(__dirname, "../../logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom log format for structured logging
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: "YYYY-MM-DD HH:mm:ss.SSS",
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(
    ({ timestamp, level, message, service, userId, requestId, ...meta }) => {
      const logEntry = {
        timestamp,
        level: level.toUpperCase(),
        service: service || "lendsmart-backend",
        message,
        ...(userId && { userId }),
        ...(requestId && { requestId }),
        ...meta,
      };

      return JSON.stringify(logEntry);
    },
  ),
);

// Security-focused format for sensitive operations
const securityFormat = winston.format.combine(
  winston.format.timestamp({
    format: "YYYY-MM-DD HH:mm:ss.SSS",
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(
    ({
      timestamp,
      level,
      message,
      userId,
      ipAddress,
      userAgent,
      action,
      resource,
      ...meta
    }) => {
      const logEntry = {
        timestamp,
        level: level.toUpperCase(),
        category: "SECURITY",
        message,
        userId: userId || "anonymous",
        ipAddress: ipAddress || "unknown",
        userAgent: userAgent || "unknown",
        action: action || "unknown",
        resource: resource || "unknown",
        ...meta,
      };

      return JSON.stringify(logEntry);
    },
  ),
);

// Performance monitoring format
const performanceFormat = winston.format.combine(
  winston.format.timestamp({
    format: "YYYY-MM-DD HH:mm:ss.SSS",
  }),
  winston.format.json(),
  winston.format.printf(
    ({
      timestamp,
      level,
      message,
      method,
      url,
      duration,
      statusCode,
      ...meta
    }) => {
      const logEntry = {
        timestamp,
        level: level.toUpperCase(),
        category: "PERFORMANCE",
        message,
        method,
        url,
        duration,
        statusCode,
        ...meta,
      };

      return JSON.stringify(logEntry);
    },
  ),
);

// Create main application logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: logFormat,
  defaultMeta: {
    service: "lendsmart-backend",
    environment: process.env.NODE_ENV || "development",
    version: process.env.APP_VERSION || "1.0.0",
  },
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
        winston.format.printf(
          ({ timestamp, level, message, service, ...meta }) => {
            const metaStr = Object.keys(meta).length
              ? JSON.stringify(meta, null, 2)
              : "";
            return `${timestamp} [${service}] ${level}: ${message} ${metaStr}`;
          },
        ),
      ),
      silent: process.env.NODE_ENV === "test",
    }),

    // File transport for all logs
    new winston.transports.File({
      filename: path.join(logsDir, "application.log"),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 10,
      tailable: true,
    }),

    // Separate file for errors
    new winston.transports.File({
      filename: path.join(logsDir, "error.log"),
      level: "error",
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true,
    }),

    // Combined log file
    new winston.transports.File({
      filename: path.join(logsDir, "combined.log"),
      maxsize: 50 * 1024 * 1024, // 50MB
      maxFiles: 20,
      tailable: true,
    }),
  ],

  // Handle uncaught exceptions
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, "exceptions.log"),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],

  // Handle unhandled promise rejections
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, "rejections.log"),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
});

// Security logger for authentication and authorization events
const securityLogger = winston.createLogger({
  level: "info",
  format: securityFormat,
  defaultMeta: {
    service: "lendsmart-security",
    environment: process.env.NODE_ENV || "development",
  },
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, "security.log"),
      maxsize: 20 * 1024 * 1024, // 20MB
      maxFiles: 10,
      tailable: true,
    }),

    // Critical security events
    new winston.transports.File({
      filename: path.join(logsDir, "security-critical.log"),
      level: "warn",
      maxsize: 10 * 1024 * 1024,
      maxFiles: 5,
      tailable: true,
    }),
  ],
});

// Performance logger for monitoring API response times
const performanceLogger = winston.createLogger({
  level: "info",
  format: performanceFormat,
  defaultMeta: {
    service: "lendsmart-performance",
    environment: process.env.NODE_ENV || "development",
  },
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, "performance.log"),
      maxsize: 20 * 1024 * 1024, // 20MB
      maxFiles: 15,
      tailable: true,
    }),
  ],
});

// Audit logger for compliance and regulatory requirements
const auditLogger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp({
      format: "YYYY-MM-DD HH:mm:ss.SSS",
    }),
    winston.format.json(),
    winston.format.printf(
      ({
        timestamp,
        level,
        message,
        userId,
        action,
        resource,
        before,
        after,
        ...meta
      }) => {
        const logEntry = {
          timestamp,
          level: level.toUpperCase(),
          category: "AUDIT",
          message,
          userId: userId || "system",
          action: action || "unknown",
          resource: resource || "unknown",
          ...(before && { before }),
          ...(after && { after }),
          ...meta,
        };

        return JSON.stringify(logEntry);
      },
    ),
  ),
  defaultMeta: {
    service: "lendsmart-audit",
    environment: process.env.NODE_ENV || "development",
  },
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, "audit.log"),
      maxsize: 50 * 1024 * 1024, // 50MB
      maxFiles: 50, // Keep more audit logs for compliance
      tailable: true,
    }),
  ],
});

// Business logic logger for financial operations
const businessLogger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp({
      format: "YYYY-MM-DD HH:mm:ss.SSS",
    }),
    winston.format.json(),
    winston.format.printf(
      ({
        timestamp,
        level,
        message,
        loanId,
        userId,
        amount,
        operation,
        ...meta
      }) => {
        const logEntry = {
          timestamp,
          level: level.toUpperCase(),
          category: "BUSINESS",
          message,
          ...(loanId && { loanId }),
          ...(userId && { userId }),
          ...(amount && { amount }),
          ...(operation && { operation }),
          ...meta,
        };

        return JSON.stringify(logEntry);
      },
    ),
  ),
  defaultMeta: {
    service: "lendsmart-business",
    environment: process.env.NODE_ENV || "development",
  },
  transports: [
    new winston.transports.File({
      filename: path.join(logsDir, "business.log"),
      maxsize: 30 * 1024 * 1024, // 30MB
      maxFiles: 20,
      tailable: true,
    }),
  ],
});

// Helper functions for structured logging
const createLogContext = (req) => {
  return {
    requestId: req.id || req.headers["x-request-id"] || "unknown",
    userId: req.user?.id || req.user?._id || null,
    ipAddress: req.ip || req.connection?.remoteAddress || "unknown",
    userAgent: req.get("User-Agent") || "unknown",
    method: req.method,
    url: req.originalUrl || req.url,
    correlationId: req.headers["x-correlation-id"] || null,
  };
};

const sanitizeForLogging = (data) => {
  if (!data || typeof data !== "object") return data;

  const sensitiveFields = [
    "password",
    "token",
    "secret",
    "key",
    "authorization",
    "ssn",
    "socialSecurityNumber",
    "creditCard",
    "bankAccount",
    "pin",
    "otp",
    "mfa",
    "privateKey",
    "apiKey",
  ];

  const sanitized = { ...data };

  const sanitizeObject = (obj) => {
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const lowerKey = key.toLowerCase();

        if (sensitiveFields.some((field) => lowerKey.includes(field))) {
          obj[key] = "[REDACTED]";
        } else if (typeof obj[key] === "object" && obj[key] !== null) {
          sanitizeObject(obj[key]);
        }
      }
    }
  };

  sanitizeObject(sanitized);
  return sanitized;
};

// Logging methods
const Logger = {
  // Standard logging methods
  debug: (message, meta = {}) =>
    logger.debug(message, sanitizeForLogging(meta)),
  info: (message, meta = {}) => logger.info(message, sanitizeForLogging(meta)),
  warn: (message, meta = {}) => logger.warn(message, sanitizeForLogging(meta)),
  error: (message, meta = {}) =>
    logger.error(message, sanitizeForLogging(meta)),

  // Security logging
  security: {
    login: (userId, ipAddress, userAgent, success = true, reason = null) => {
      securityLogger.info("User login attempt", {
        userId,
        ipAddress,
        userAgent,
        action: "login",
        resource: "authentication",
        success,
        reason,
      });
    },

    logout: (userId, ipAddress, userAgent) => {
      securityLogger.info("User logout", {
        userId,
        ipAddress,
        userAgent,
        action: "logout",
        resource: "authentication",
      });
    },

    accessDenied: (userId, resource, action, ipAddress, userAgent, reason) => {
      securityLogger.warn("Access denied", {
        userId,
        ipAddress,
        userAgent,
        action,
        resource,
        reason,
      });
    },

    suspiciousActivity: (userId, activity, ipAddress, userAgent, details) => {
      securityLogger.error("Suspicious activity detected", {
        userId,
        ipAddress,
        userAgent,
        action: "suspicious_activity",
        resource: "security",
        activity,
        details,
      });
    },

    dataAccess: (userId, resource, action, ipAddress, userAgent) => {
      securityLogger.info("Data access", {
        userId,
        ipAddress,
        userAgent,
        action,
        resource,
      });
    },

    blockedIPAccess: (ip, path, method) => {
      securityLogger.warn("Blocked IP access attempt", {
        ip,
        path,
        method,
        action: "blocked_ip_access",
        resource: "security",
      });
    },

    ipBlocked: (ip, attempts, reason) => {
      securityLogger.error("IP address blocked", {
        ip,
        attempts,
        reason,
        action: "ip_blocked",
        resource: "security",
      });
    },

    ipUnblocked: (ip) => {
      securityLogger.info("IP address unblocked", {
        ip,
        action: "ip_unblocked",
        resource: "security",
      });
    },

    failedAttempt: (ip, count, reason) => {
      securityLogger.warn("Failed attempt recorded", {
        ip,
        count,
        reason,
        action: "failed_attempt",
        resource: "security",
      });
    },

    rateLimitExceeded: (ip, path, userAgent) => {
      securityLogger.warn("Rate limit exceeded", {
        ip,
        path,
        userAgent,
        action: "rate_limit_exceeded",
        resource: "security",
      });
    },

    authRateLimitExceeded: (ip, identifier, userAgent) => {
      securityLogger.warn("Auth rate limit exceeded", {
        ip,
        identifier,
        userAgent,
        action: "auth_rate_limit_exceeded",
        resource: "authentication",
      });
    },

    csrfViolation: (ip, path, userAgent) => {
      securityLogger.error("CSRF violation detected", {
        ip,
        path,
        userAgent,
        action: "csrf_violation",
        resource: "security",
      });
    },
  },

  // Performance logging
  performance: {
    apiRequest: (method, url, duration, statusCode, userId = null) => {
      const level =
        duration > 5000 ? "warn" : duration > 2000 ? "info" : "debug";
      performanceLogger.log(level, "API request completed", {
        method,
        url,
        duration,
        statusCode,
        userId,
      });
    },

    databaseQuery: (operation, collection, duration, recordCount = null) => {
      const level = duration > 1000 ? "warn" : "debug";
      performanceLogger.log(level, "Database query completed", {
        operation,
        collection,
        duration,
        recordCount,
      });
    },

    externalService: (service, operation, duration, success = true) => {
      const level = !success ? "error" : duration > 3000 ? "warn" : "info";
      performanceLogger.log(level, "External service call", {
        service,
        operation,
        duration,
        success,
      });
    },
  },

  // Audit logging
  audit: {
    userAction: (
      userId,
      action,
      resource,
      before = null,
      after = null,
      ipAddress = null,
    ) => {
      auditLogger.info("User action performed", {
        userId,
        action,
        resource,
        before: sanitizeForLogging(before),
        after: sanitizeForLogging(after),
        ipAddress,
      });
    },

    systemAction: (action, resource, details = null) => {
      auditLogger.info("System action performed", {
        userId: "system",
        action,
        resource,
        details: sanitizeForLogging(details),
      });
    },

    dataChange: (userId, table, recordId, before, after, ipAddress = null) => {
      auditLogger.info("Data change recorded", {
        userId,
        action: "data_change",
        resource: table,
        recordId,
        before: sanitizeForLogging(before),
        after: sanitizeForLogging(after),
        ipAddress,
      });
    },
  },

  // Business logging
  business: {
    loanApplication: (userId, loanId, amount, purpose) => {
      businessLogger.info("Loan application submitted", {
        userId,
        loanId,
        amount,
        operation: "loan_application",
        purpose,
      });
    },

    loanApproval: (userId, loanId, amount, approvedBy) => {
      businessLogger.info("Loan approved", {
        userId,
        loanId,
        amount,
        operation: "loan_approval",
        approvedBy,
      });
    },

    payment: (userId, loanId, amount, paymentMethod, transactionId) => {
      businessLogger.info("Payment processed", {
        userId,
        loanId,
        amount,
        operation: "payment",
        paymentMethod,
        transactionId,
      });
    },

    creditScoreUpdate: (userId, oldScore, newScore, reason) => {
      businessLogger.info("Credit score updated", {
        userId,
        operation: "credit_score_update",
        oldScore,
        newScore,
        reason,
      });
    },
  },

  // Request logging middleware
  requestLogger: (req, res, next) => {
    const startTime = Date.now();
    const context = createLogContext(req);

    // Add request ID to request object
    req.logContext = context;

    // Log incoming request
    logger.info("Incoming request", {
      ...context,
      body: sanitizeForLogging(req.body),
      query: sanitizeForLogging(req.query),
      params: sanitizeForLogging(req.params),
    });

    // Override res.end to log response
    const originalEnd = res.end;
    res.end = function (...args) {
      const duration = Date.now() - startTime;

      // Log response
      Logger.performance.apiRequest(
        req.method,
        req.originalUrl || req.url,
        duration,
        res.statusCode,
        context.userId,
      );

      // Log error responses
      if (res.statusCode >= 400) {
        logger.warn("Request completed with error", {
          ...context,
          statusCode: res.statusCode,
          duration,
        });
      }

      originalEnd.apply(this, args);
    };

    next();
  },
};

// Export loggers and utilities
module.exports = {
  logger: Logger,
  rawLogger: logger,
  securityLogger,
  performanceLogger,
  auditLogger,
  businessLogger,
  createLogContext,
  sanitizeForLogging,
};
