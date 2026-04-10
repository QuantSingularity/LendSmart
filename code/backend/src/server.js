const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const rateLimit = require("express-rate-limit");
const mongoSanitize = require("express-mongo-sanitize");
// XSS protection is handled by helmet and express-validator
// const xss = require('xss-clean');
const hpp = require("hpp");
const morgan = require("morgan");

// Import configurations and utilities
const { databaseManager } = require("./config/database");
const { logger } = require("./utils/logger");
const {
  setupGlobalHandlers,
  handleError,
  handleNotFound,
} = require("./middleware/monitoring/errorHandler");
const {
  healthCheckMiddleware,
} = require("./middleware/monitoring/healthCheck");
const {
  httpMetricsMiddleware,
  getMetricsHandler,
} = require("./middleware/monitoring/metricsCollector");

// Import middleware
const authMiddleware = require("./middleware/auth");
const { rateLimiter } = require("./middleware/security/rateLimiter");
// Import routes
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const loanRoutes = require("./routes/loanRoutes");
const adminRoutes = require("./routes/adminRoutes");

/**
 * LendSmart Production Backend Server
 * Enterprise-grade financial services backend with comprehensive security,
 * monitoring, compliance, and scalability features
 */

class LendSmartServer {
  constructor() {
    this.app = express();
    this.server = null;
    this.isShuttingDown = false;
  }

  /**
   * Initialize the server with all middleware and configurations
   */
  async initialize() {
    try {
      // Setup global error handlers
      setupGlobalHandlers();

      // Connect to databases
      await this.connectDatabases();

      // Configure middleware
      this.configureMiddleware();

      // Setup routes
      this.setupRoutes();

      // Setup error handling
      this.setupErrorHandling();

      logger.info("Server initialization completed successfully");
    } catch (error) {
      logger.error("Server initialization failed", { error: error.message });
      throw error;
    }
  }

  /**
   * Connect to databases
   */
  async connectDatabases() {
    try {
      await databaseManager.connect();
      logger.info("Database connections established");
    } catch (error) {
      logger.error("Database connection failed", { error: error.message });
      throw error;
    }
  }

  /**
   * Configure all middleware
   */
  configureMiddleware() {
    // Trust proxy for accurate IP addresses
    this.app.set("trust proxy", 1);

    // Security middleware
    this.app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
          },
        },
        crossOriginEmbedderPolicy: false,
      }),
    );

    // CORS configuration
    const corsOptions = {
      origin:
        process.env.NODE_ENV === "production"
          ? process.env.ALLOWED_ORIGINS?.split(",") || ["https://lendsmart.com"]
          : true,
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      allowedHeaders: [
        "Origin",
        "X-Requested-With",
        "Content-Type",
        "Accept",
        "Authorization",
        "X-Request-ID",
        "X-Correlation-ID",
      ],
      exposedHeaders: ["X-Request-ID", "X-Rate-Limit-Remaining"],
      maxAge: 86400, // 24 hours
    };
    this.app.use(cors(corsOptions));

    // Compression
    this.app.use(
      compression({
        filter: (req, res) => {
          if (req.headers["x-no-compression"]) {
            return false;
          }
          return compression.filter(req, res);
        },
        threshold: 1024, // Only compress responses larger than 1KB
      }),
    );

    // Body parsing middleware
    this.app.use(
      express.json({
        limit: "10mb",
        verify: (req, res, buf) => {
          req.rawBody = buf;
        },
      }),
    );
    this.app.use(
      express.urlencoded({
        extended: true,
        limit: "10mb",
      }),
    );

    // Cookie parsing
    this.app.use(cookieParser());

    // Security sanitization
    this.app.use(
      mongoSanitize({
        replaceWith: "_",
        onSanitize: ({ req, key }) => {
          logger.security.suspiciousActivity(
            req.user?.id,
            "nosql_injection_attempt",
            req.ip,
            req.get("User-Agent"),
            { sanitizedKey: key },
          );
        },
      }),
    );

    // XSS protection via helmet and input validation
    // this.app.use(xss());
    this.app.use(
      hpp({
        whitelist: ["sort", "fields", "page", "limit", "filter"],
      }),
    );

    // Request logging
    if (process.env.NODE_ENV !== "test") {
      this.app.use(
        morgan("combined", {
          stream: {
            write: (message) => logger.info(message.trim()),
          },
        }),
      );
    }

    // Custom request logging and metrics
    this.app.use(logger.requestLogger);
    this.app.use(httpMetricsMiddleware());

    // Rate limiting - disabled in test environment
    if (process.env.NODE_ENV !== "test") {
      this.app.use("/api/", rateLimiter.globalLimiter);
      this.app.use("/api/auth/", rateLimiter.authLimiter);
    }

    // Request ID middleware
    this.app.use((req, res, next) => {
      req.id =
        req.headers["x-request-id"] ||
        `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      res.setHeader("X-Request-ID", req.id);
      next();
    });

    logger.info("Middleware configuration completed");
  }

  /**
   * Setup all routes
   */
  setupRoutes() {
    // Health check endpoints
    this.app.get("/health", healthCheckMiddleware.basic);
    this.app.get("/health/detailed", healthCheckMiddleware.detailed);
    this.app.get("/health/ready", healthCheckMiddleware.readiness);
    this.app.get("/health/live", healthCheckMiddleware.liveness);

    // Metrics endpoint
    this.app.get("/metrics", getMetricsHandler());

    // API routes
    this.app.use("/api/auth", authRoutes);
    this.app.use("/api/users", userRoutes);
    this.app.use("/api/loans", loanRoutes);
    this.app.use("/api/admin", adminRoutes);

    // API documentation
    this.app.get("/api", (req, res) => {
      res.json({
        name: "LendSmart API",
        version: process.env.APP_VERSION || "1.0.0",
        description: "Enterprise-grade financial services backend",
        environment: process.env.NODE_ENV || "development",
        endpoints: {
          health: "/health",
          metrics: "/metrics",
          auth: "/api/auth",
          users: "/api/users",
          loans: "/api/loans",
          admin: "/api/admin",
        },
        documentation: "/api/docs",
      });
    });

    // Root endpoint
    this.app.get("/", (req, res) => {
      res.json({
        message: "LendSmart Backend API",
        version: process.env.APP_VERSION || "1.0.0",
        status: "operational",
        timestamp: new Date().toISOString(),
      });
    });

    logger.info("Routes setup completed");
  }

  /**
   * Setup error handling
   */
  setupErrorHandling() {
    // 404 handler
    this.app.use(handleNotFound);

    // Global error handler
    this.app.use(handleError);

    logger.info("Error handling setup completed");
  }

  /**
   * Start the server
   */
  async start() {
    try {
      await this.initialize();

      const port = process.env.PORT || 3000;
      const host = process.env.HOST || "0.0.0.0";

      this.server = this.app.listen(port, host, () => {
        logger.info(`LendSmart server started successfully`, {
          port,
          host,
          environment: process.env.NODE_ENV || "development",
          version: process.env.APP_VERSION || "1.0.0",
        });
      });

      // Store server reference globally for graceful shutdown
      global.server = this.server;

      // Handle server errors
      this.server.on("error", (error) => {
        logger.error("Server error occurred", { error: error.message });
      });

      // Handle connection errors
      this.server.on("clientError", (err, socket) => {
        logger.warn("Client connection error", { error: err.message });
        socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
      });

      return this.server;
    } catch (error) {
      logger.error("Failed to start server", { error: error.message });
      throw error;
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    logger.info("Starting graceful shutdown...");

    try {
      // Stop accepting new connections
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(resolve);
        });
        logger.info("HTTP server closed");
      }

      // Close database connections
      await databaseManager.disconnect();
      logger.info("Database connections closed");

      logger.info("Graceful shutdown completed");
    } catch (error) {
      logger.error("Error during shutdown", { error: error.message });
      throw error;
    }
  }
}

// Create server instance
const lendSmartServer = new LendSmartServer();

// Export for testing
const app = lendSmartServer.app;

// Initialize synchronously for test environment (no DB connection)
if (process.env.NODE_ENV === "test") {
  lendSmartServer.configureMiddleware();
  lendSmartServer.setupRoutes();
  lendSmartServer.setupErrorHandling();
}

module.exports = app;

// Start server if not in test environment
if (process.env.NODE_ENV !== "test") {
  lendSmartServer.start().catch((error) => {
    logger.error("Failed to start LendSmart server", { error: error.message });
    process.exit(1);
  });

  // Graceful shutdown handlers
  const gracefulShutdown = (signal) => {
    logger.info(`Received ${signal}, initiating graceful shutdown...`);

    lendSmartServer
      .shutdown()
      .then(() => {
        logger.info("Graceful shutdown completed successfully");
        process.exit(0);
      })
      .catch((error) => {
        logger.error("Error during graceful shutdown", {
          error: error.message,
        });
        process.exit(1);
      });
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
  process.on("SIGUSR2", () => gracefulShutdown("SIGUSR2")); // Nodemon restart
}

// Attach server instance for external use without overriding the default export
app.lendSmartServer = lendSmartServer;
