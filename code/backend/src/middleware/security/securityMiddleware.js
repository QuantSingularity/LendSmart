const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const slowDown = require("express-slow-down");
const crypto = require("crypto");
const { logger } = require("../../utils/logger");
const { AppError } = require("../monitoring/errorHandler");

/**
 * Comprehensive Security Middleware for LendSmart
 * Implements financial industry security standards including
 * OWASP recommendations, PCI DSS compliance, and advanced threat protection
 */
class SecurityMiddleware {
  constructor() {
    this.suspiciousIPs = new Map();
    this.failedAttempts = new Map();
    this.blockedIPs = new Set();

    // Security configuration
    this.config = {
      maxFailedAttempts: parseInt(process.env.MAX_FAILED_ATTEMPTS) || 5,
      blockDuration: parseInt(process.env.BLOCK_DURATION) || 15 * 60 * 1000, // 15 minutes
      suspiciousThreshold: parseInt(process.env.SUSPICIOUS_THRESHOLD) || 10,
      cleanupInterval: parseInt(process.env.CLEANUP_INTERVAL) || 5 * 60 * 1000, // 5 minutes
      csrfTokenExpiry:
        parseInt(process.env.CSRF_TOKEN_EXPIRY) || 60 * 60 * 1000, // 1 hour
      sessionTimeout: parseInt(process.env.SESSION_TIMEOUT) || 30 * 60 * 1000, // 30 minutes
    };

    // CSRF token storage (in production, use Redis)
    this.csrfTokens = new Map();

    // Initialize cleanup intervals
    this.startCleanupTasks();
  }

  /**
   * Get comprehensive helmet configuration for financial applications
   */
  getHelmetConfig() {
    return helmet({
      // Content Security Policy
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            "https://fonts.googleapis.com",
          ],
          scriptSrc: ["'self'", "'strict-dynamic'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "https://api.lendsmart.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: [],
        },
        reportOnly: process.env.NODE_ENV === "development",
      },

      // HTTP Strict Transport Security
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      },

      // X-Frame-Options
      frameguard: {
        action: "deny",
      },

      // X-Content-Type-Options
      noSniff: true,

      // X-XSS-Protection
      xssFilter: true,

      // Referrer Policy
      referrerPolicy: {
        policy: "strict-origin-when-cross-origin",
      },

      // Permissions Policy
      permissionsPolicy: {
        features: {
          camera: ["'none'"],
          microphone: ["'none'"],
          geolocation: ["'self'"],
          payment: ["'self'"],
          usb: ["'none'"],
          magnetometer: ["'none'"],
          gyroscope: ["'none'"],
          accelerometer: ["'none'"],
        },
      },

      // Hide X-Powered-By header
      hidePoweredBy: true,

      // DNS Prefetch Control
      dnsPrefetchControl: {
        allow: false,
      },

      // Expect-CT
      expectCt: {
        maxAge: 86400, // 24 hours
        enforce: true,
      },
    });
  }

  /**
   * Rate limiting configuration for different endpoints
   */
  getRateLimiters() {
    return {
      // Global rate limiter
      global: rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 1000, // 1000 requests per window
        message: {
          error: "Too many requests from this IP",
          code: "RATE_LIMIT_EXCEEDED",
          retryAfter: 900, // 15 minutes
        },
        standardHeaders: true,
        legacyHeaders: false,
        handler: this._rateLimitHandler.bind(this),
        skip: (req) => this._shouldSkipRateLimit(req),
      }),

      // Authentication endpoints
      auth: rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 5, // 5 attempts per window
        message: {
          error: "Too many authentication attempts",
          code: "AUTH_RATE_LIMIT_EXCEEDED",
          retryAfter: 900,
        },
        skipSuccessfulRequests: true,
        handler: this._authRateLimitHandler.bind(this),
      }),

      // Password reset
      passwordReset: rateLimit({
        windowMs: 60 * 60 * 1000, // 1 hour
        max: 3, // 3 attempts per hour
        message: {
          error: "Too many password reset attempts",
          code: "PASSWORD_RESET_RATE_LIMIT_EXCEEDED",
          retryAfter: 3600,
        },
      }),

      // API endpoints
      api: rateLimit({
        windowMs: 60 * 1000, // 1 minute
        max: 100, // 100 requests per minute
        message: {
          error: "API rate limit exceeded",
          code: "API_RATE_LIMIT_EXCEEDED",
          retryAfter: 60,
        },
      }),

      // Payment endpoints (stricter)
      payment: rateLimit({
        windowMs: 60 * 1000, // 1 minute
        max: 10, // 10 payment requests per minute
        message: {
          error: "Payment rate limit exceeded",
          code: "PAYMENT_RATE_LIMIT_EXCEEDED",
          retryAfter: 60,
        },
      }),

      // File upload
      upload: rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 20, // 20 uploads per window
        message: {
          error: "Upload rate limit exceeded",
          code: "UPLOAD_RATE_LIMIT_EXCEEDED",
          retryAfter: 900,
        },
      }),
    };
  }

  /**
   * Speed limiting configuration
   */
  getSpeedLimiters() {
    return {
      // Slow down repeated requests
      general: slowDown({
        windowMs: 15 * 60 * 1000, // 15 minutes
        delayAfter: 100, // Allow 100 requests per window at full speed
        delayMs: 500, // Add 500ms delay per request after delayAfter
        maxDelayMs: 20000, // Maximum delay of 20 seconds
        skipSuccessfulRequests: true,
      }),

      // Authentication slow down
      auth: slowDown({
        windowMs: 15 * 60 * 1000, // 15 minutes
        delayAfter: 2, // Start slowing down after 2 requests
        delayMs: 1000, // Add 1 second delay per request
        maxDelayMs: 30000, // Maximum delay of 30 seconds
        skipSuccessfulRequests: false,
      }),
    };
  }

  /**
   * IP blocking middleware
   */
  ipBlockingMiddleware = (req, res, next) => {
    const clientIP = this._getClientIP(req);

    // Check if IP is blocked
    if (this.blockedIPs.has(clientIP)) {
      logger.security.blockedIPAccess(clientIP, req.path, req.method);

      return res.status(403).json({
        error: "Access denied",
        code: "IP_BLOCKED",
        message:
          "Your IP address has been temporarily blocked due to suspicious activity",
      });
    }

    // Check failed attempts
    const attempts = this.failedAttempts.get(clientIP);
    if (attempts && attempts.count >= this.config.maxFailedAttempts) {
      const timeSinceLastAttempt = Date.now() - attempts.lastAttempt;

      if (timeSinceLastAttempt < this.config.blockDuration) {
        // Block the IP
        this.blockedIPs.add(clientIP);

        logger.security.ipBlocked(
          clientIP,
          attempts.count,
          "excessive_failed_attempts",
        );

        return res.status(403).json({
          error: "Access denied",
          code: "IP_BLOCKED",
          message:
            "Your IP address has been temporarily blocked due to excessive failed attempts",
        });
      } else {
        // Reset failed attempts after block duration
        this.failedAttempts.delete(clientIP);
      }
    }

    next();
  };

  /**
   * Suspicious activity detection middleware
   */
  suspiciousActivityMiddleware = (req, res, next) => {
    const clientIP = this._getClientIP(req);
    const userAgent = req.get("User-Agent") || "";
    const path = req.path;

    // Check for suspicious patterns
    const suspiciousIndicators = this._detectSuspiciousActivity(req);

    if (suspiciousIndicators.length > 0) {
      this._recordSuspiciousActivity(clientIP, suspiciousIndicators);

      logger.security.suspiciousActivity(
        req.user?.id || "anonymous",
        "suspicious_request_pattern",
        clientIP,
        userAgent,
        {
          path,
          method: req.method,
          indicators: suspiciousIndicators,
          headers: this._sanitizeHeaders(req.headers),
          query: req.query,
          body: this._sanitizeBody(req.body),
        },
      );

      // If too many suspicious activities, block the IP
      const suspiciousCount = this.suspiciousIPs.get(clientIP)?.count || 0;
      if (suspiciousCount >= this.config.suspiciousThreshold) {
        this.blockedIPs.add(clientIP);

        logger.security.ipBlocked(
          clientIP,
          suspiciousCount,
          "suspicious_activity",
        );

        return res.status(403).json({
          error: "Access denied",
          code: "SUSPICIOUS_ACTIVITY_DETECTED",
          message: "Suspicious activity detected",
        });
      }
    }

    next();
  };

  /**
   * CSRF protection middleware
   */
  csrfProtection = (req, res, next) => {
    // Skip CSRF for GET, HEAD, OPTIONS requests
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      return next();
    }

    // Skip CSRF for API endpoints with valid JWT
    if (req.path.startsWith("/api/") && req.user) {
      return next();
    }

    const token = req.headers["x-csrf-token"] || req.body._csrf;
    const sessionToken = req.session?.csrfToken;

    if (
      !token ||
      !sessionToken ||
      !this._validateCSRFToken(token, sessionToken)
    ) {
      logger.security.csrfViolation(
        req.user?.id || "anonymous",
        this._getClientIP(req),
        req.path,
        req.method,
      );

      return res.status(403).json({
        error: "CSRF token validation failed",
        code: "CSRF_TOKEN_INVALID",
      });
    }

    next();
  };

  /**
   * Generate CSRF token
   */
  generateCSRFToken(sessionId) {
    const token = crypto.randomBytes(32).toString("hex");
    const timestamp = Date.now();

    this.csrfTokens.set(token, {
      sessionId,
      timestamp,
      used: false,
    });

    return token;
  }

  /**
   * Input sanitization middleware
   */
  inputSanitization = (req, res, next) => {
    try {
      // Sanitize query parameters
      if (req.query) {
        req.query = this._sanitizeObject(req.query);
      }

      // Sanitize request body
      if (req.body) {
        req.body = this._sanitizeObject(req.body);
      }

      // Sanitize URL parameters
      if (req.params) {
        req.params = this._sanitizeObject(req.params);
      }

      next();
    } catch (error) {
      logger.error("Input sanitization failed", {
        error: error.message,
        path: req.path,
        method: req.method,
      });

      return res.status(400).json({
        error: "Invalid input data",
        code: "INPUT_SANITIZATION_ERROR",
      });
    }
  };

  /**
   * Security headers middleware
   */
  securityHeaders = (req, res, next) => {
    // Add custom security headers
    res.setHeader("X-Request-ID", req.id || crypto.randomUUID());
    res.setHeader("X-API-Version", process.env.API_VERSION || "1.0.0");
    res.setHeader("X-Rate-Limit-Policy", "strict");

    // Remove sensitive headers
    res.removeHeader("X-Powered-By");
    res.removeHeader("Server");

    next();
  };

  /**
   * Session security middleware
   */
  sessionSecurity = (req, res, next) => {
    if (req.session) {
      const now = Date.now();

      // Check session timeout
      if (req.session.lastActivity) {
        const timeSinceLastActivity = now - req.session.lastActivity;

        if (timeSinceLastActivity > this.config.sessionTimeout) {
          req.session.destroy((err) => {
            if (err) {
              logger.error("Session destruction failed", {
                error: err.message,
              });
            }
          });

          return res.status(401).json({
            error: "Session expired",
            code: "SESSION_EXPIRED",
          });
        }
      }

      // Update last activity
      req.session.lastActivity = now;

      // Regenerate session ID periodically
      if (
        !req.session.lastRegeneration ||
        now - req.session.lastRegeneration > 15 * 60 * 1000
      ) {
        // 15 minutes

        req.session.regenerate((err) => {
          if (err) {
            logger.error("Session regeneration failed", { error: err.message });
          } else {
            req.session.lastRegeneration = now;
          }
        });
      }
    }

    next();
  };

  /**
   * Record failed authentication attempt
   */
  recordFailedAttempt(ip, reason = "authentication_failed") {
    const attempts = this.failedAttempts.get(ip) || {
      count: 0,
      lastAttempt: 0,
    };
    attempts.count++;
    attempts.lastAttempt = Date.now();
    attempts.reason = reason;

    this.failedAttempts.set(ip, attempts);

    logger.security.failedAttempt(ip, attempts.count, reason);
  }

  /**
   * Clear failed attempts for IP (on successful auth)
   */
  clearFailedAttempts(ip) {
    this.failedAttempts.delete(ip);
  }

  /**
   * Get client IP address
   * @private
   */
  _getClientIP(req) {
    return (
      req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.ip ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      "unknown"
    );
  }

  /**
   * Detect suspicious activity patterns
   * @private
   */
  _detectSuspiciousActivity(req) {
    const indicators = [];
    const userAgent = req.get("User-Agent") || "";
    const path = req.path;
    const method = req.method;

    // Check for bot-like user agents
    const botPatterns = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /scraper/i,
      /curl/i,
      /wget/i,
      /python/i,
      /java/i,
    ];

    if (botPatterns.some((pattern) => pattern.test(userAgent))) {
      indicators.push("bot_user_agent");
    }

    // Check for suspicious paths
    const suspiciousPaths = [
      /\/admin/i,
      /\/wp-admin/i,
      /\/phpmyadmin/i,
      /\.php$/i,
      /\.asp$/i,
      /\.jsp$/i,
      /\/etc\/passwd/i,
      /\/proc\//i,
    ];

    if (suspiciousPaths.some((pattern) => pattern.test(path))) {
      indicators.push("suspicious_path");
    }

    // Check for SQL injection patterns
    const sqlPatterns = [
      /union.*select/i,
      /drop.*table/i,
      /insert.*into/i,
      /delete.*from/i,
      /update.*set/i,
      /exec.*sp_/i,
    ];

    const requestString = JSON.stringify({
      query: req.query,
      body: req.body,
      params: req.params,
    });

    if (sqlPatterns.some((pattern) => pattern.test(requestString))) {
      indicators.push("sql_injection_attempt");
    }

    // Check for XSS patterns
    const xssPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /eval\s*\(/i,
      /expression\s*\(/i,
    ];

    if (xssPatterns.some((pattern) => pattern.test(requestString))) {
      indicators.push("xss_attempt");
    }

    // Check for directory traversal
    if (/\.\.\//.test(requestString) || /\.\.\\/.test(requestString)) {
      indicators.push("directory_traversal_attempt");
    }

    // Check for unusual request frequency
    const clientIP = this._getClientIP(req);
    const recentRequests = this._getRecentRequestCount(clientIP);
    if (recentRequests > 50) {
      // More than 50 requests in last minute
      indicators.push("high_request_frequency");
    }

    return indicators;
  }

  /**
   * Record suspicious activity
   * @private
   */
  _recordSuspiciousActivity(ip, indicators) {
    const activity = this.suspiciousIPs.get(ip) || {
      count: 0,
      lastActivity: 0,
      indicators: [],
    };
    activity.count++;
    activity.lastActivity = Date.now();
    activity.indicators.push(...indicators);

    this.suspiciousIPs.set(ip, activity);
  }

  /**
   * Get recent request count for IP
   * @private
   */
  _getRecentRequestCount(ip) {
    // This would be implemented with a proper request tracking mechanism
    // For now, return 0 as placeholder
    return 0;
  }

  /**
   * Validate CSRF token
   * @private
   */
  _validateCSRFToken(token, sessionToken) {
    const tokenData = this.csrfTokens.get(token);

    if (!tokenData || tokenData.used) {
      return false;
    }

    // Check if token has expired
    if (Date.now() - tokenData.timestamp > this.config.csrfTokenExpiry) {
      this.csrfTokens.delete(token);
      return false;
    }

    // Mark token as used (one-time use)
    tokenData.used = true;

    return token === sessionToken;
  }

  /**
   * Sanitize object recursively
   * @private
   */
  _sanitizeObject(obj) {
    if (typeof obj !== "object" || obj === null) {
      return this._sanitizeValue(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this._sanitizeObject(item));
    }

    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      const sanitizedKey = this._sanitizeValue(key);
      sanitized[sanitizedKey] = this._sanitizeObject(value);
    }

    return sanitized;
  }

  /**
   * Sanitize individual value
   * @private
   */
  _sanitizeValue(value) {
    if (typeof value !== "string") {
      return value;
    }

    // Remove null bytes
    value = value.replace(/\0/g, "");

    // Limit string length to prevent DoS
    if (value.length > 10000) {
      value = value.substring(0, 10000);
    }

    // Remove potentially dangerous characters
    value = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

    return value;
  }

  /**
   * Sanitize headers for logging
   * @private
   */
  _sanitizeHeaders(headers) {
    const sanitized = { ...headers };

    // Remove sensitive headers
    delete sanitized.authorization;
    delete sanitized.cookie;
    delete sanitized["x-api-key"];

    return sanitized;
  }

  /**
   * Sanitize body for logging
   * @private
   */
  _sanitizeBody(body) {
    if (!body || typeof body !== "object") {
      return body;
    }

    const sanitized = { ...body };

    // Remove sensitive fields
    const sensitiveFields = [
      "password",
      "confirmPassword",
      "currentPassword",
      "newPassword",
      "ssn",
      "socialSecurityNumber",
      "creditCardNumber",
      "cvv",
      "accountNumber",
      "routingNumber",
      "pin",
    ];

    sensitiveFields.forEach((field) => {
      if (sanitized[field]) {
        sanitized[field] = "[REDACTED]";
      }
    });

    return sanitized;
  }

  /**
   * Rate limit handler
   * @private
   */
  _rateLimitHandler(req, res) {
    const clientIP = this._getClientIP(req);

    logger.security.rateLimitExceeded(
      clientIP,
      req.path,
      req.method,
      req.user?.id || "anonymous",
    );

    this.recordFailedAttempt(clientIP, "rate_limit_exceeded");
  }

  /**
   * Auth rate limit handler
   * @private
   */
  _authRateLimitHandler(req, res) {
    const clientIP = this._getClientIP(req);

    logger.security.authRateLimitExceeded(
      clientIP,
      req.body?.email || "unknown",
      req.path,
    );

    this.recordFailedAttempt(clientIP, "auth_rate_limit_exceeded");
  }

  /**
   * Check if request should skip rate limiting
   * @private
   */
  _shouldSkipRateLimit(req) {
    // Skip rate limiting for health checks
    if (req.path === "/health" || req.path === "/metrics") {
      return true;
    }

    // Skip for trusted IPs (if configured)
    const trustedIPs = process.env.TRUSTED_IPS?.split(",") || [];
    const clientIP = this._getClientIP(req);

    return trustedIPs.includes(clientIP);
  }

  /**
   * Start cleanup tasks
   * @private
   */
  startCleanupTasks() {
    // Clean up old failed attempts and suspicious activities
    this._cleanupInterval = setInterval(() => {
      const now = Date.now();
      const cutoff = now - this.config.blockDuration;

      // Clean failed attempts
      for (const [ip, attempts] of this.failedAttempts.entries()) {
        if (attempts.lastAttempt < cutoff) {
          this.failedAttempts.delete(ip);
        }
      }

      // Clean suspicious activities
      for (const [ip, activity] of this.suspiciousIPs.entries()) {
        if (activity.lastActivity < cutoff) {
          this.suspiciousIPs.delete(ip);
        }
      }

      // Clean expired CSRF tokens
      for (const [token, data] of this.csrfTokens.entries()) {
        if (now - data.timestamp > this.config.csrfTokenExpiry) {
          this.csrfTokens.delete(token);
        }
      }

      // Unblock IPs after block duration
      for (const ip of this.blockedIPs) {
        const attempts = this.failedAttempts.get(ip);
        if (
          !attempts ||
          now - attempts.lastAttempt > this.config.blockDuration
        ) {
          this.blockedIPs.delete(ip);
          logger.security.ipUnblocked(ip);
        }
      }
    }, this.config.cleanupInterval);

    logger.info("Security cleanup tasks started");
  }

  /**
   * Stop cleanup tasks (used in tests)
   */
  cleanup() {
    if (this._cleanupInterval) {
      clearInterval(this._cleanupInterval);
      this._cleanupInterval = null;
    }
  }

  /**
   * Get security statistics
   */
  getSecurityStats() {
    return {
      blockedIPs: this.blockedIPs.size,
      failedAttempts: this.failedAttempts.size,
      suspiciousIPs: this.suspiciousIPs.size,
      activeCSRFTokens: this.csrfTokens.size,
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = new SecurityMiddleware();
