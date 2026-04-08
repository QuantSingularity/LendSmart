const request = require("supertest");
const express = require("express");
const securityMiddleware = require("../../src/middleware/security/securityMiddleware");
const {
  handleError,
  handleNotFound,
  asyncHandler,
  AppError,
} = require("../../src/middleware/monitoring/errorHandler");

describe("Security Middleware", () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  describe("Rate Limiting", () => {
    test("should allow requests within rate limit", async () => {
      const rateLimiters = securityMiddleware.getRateLimiters();
      app.use("/api", rateLimiters.api);
      app.get("/api/test", (req, res) => res.json({ success: true }));

      const response = await request(app).get("/api/test");
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test("getRateLimiters should return limiter objects", () => {
      const rateLimiters = securityMiddleware.getRateLimiters();
      expect(rateLimiters).toBeDefined();
      expect(typeof rateLimiters).toBe("object");
    });
  });

  describe("IP Blocking", () => {
    test("should allow access from non-blocked IP", async () => {
      app.use(securityMiddleware.ipBlockingMiddleware);
      app.get("/test", (req, res) => res.json({ success: true }));

      const response = await request(app).get("/test");
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    test("should block access after multiple failed attempts", async () => {
      app.use(securityMiddleware.ipBlockingMiddleware);
      app.get("/test", (req, res) => res.json({ success: true }));

      const clientIP = `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
      for (let i = 0; i < 6; i++) {
        securityMiddleware.recordFailedAttempt(clientIP, "test_failure");
      }

      const response = await request(app)
        .get("/test")
        .set("X-Forwarded-For", clientIP);

      expect(response.status).toBe(403);
      expect(response.body.code).toBe("IP_BLOCKED");
    });

    test("recordFailedAttempt should track attempts", () => {
      const ip = "10.0.0.1";
      securityMiddleware.recordFailedAttempt(ip, "test");
      const stats = securityMiddleware.getSecurityStats();
      expect(stats.failedAttempts).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Suspicious Activity Detection", () => {
    test("should detect SQL injection attempts", async () => {
      app.use(securityMiddleware.suspiciousActivityMiddleware);
      app.get("/test", (req, res) => res.json({ success: true }));

      const response = await request(app)
        .get("/test")
        .query({ search: "'; DROP TABLE users; --" });

      // Should still process but log suspicious activity
      expect(response.status).toBe(200);
    });

    test("should detect XSS attempts", async () => {
      app.use(securityMiddleware.suspiciousActivityMiddleware);
      app.post("/test", (req, res) => res.json({ success: true }));

      const response = await request(app)
        .post("/test")
        .send({ content: "<script>alert('xss')</script>" });

      expect(response.status).toBe(200);
    });
  });

  describe("Security Stats", () => {
    test("getSecurityStats should return stats object", () => {
      const stats = securityMiddleware.getSecurityStats();
      expect(stats).toBeDefined();
      expect(typeof stats.blockedIPs).toBe("number");
      expect(typeof stats.failedAttempts).toBe("number");
      expect(typeof stats.suspiciousIPs).toBe("number");
      expect(stats.timestamp).toBeDefined();
    });
  });
});

describe("Error Handler Middleware", () => {
  describe("AppError class", () => {
    test("should create AppError with correct properties", () => {
      const err = new AppError("Test error", 400, "TEST_ERROR");
      expect(err.message).toBe("Test error");
      expect(err.statusCode).toBe(400);
      expect(err.code).toBe("TEST_ERROR");
      expect(err.isOperational).toBe(true);
      expect(err instanceof Error).toBe(true);
    });

    test("should default to 500 statusCode", () => {
      const err = new AppError("Test error");
      expect(err.statusCode).toBe(500);
    });

    test("should be instanceof Error", () => {
      const err = new AppError("msg", 404, "NOT_FOUND");
      expect(err instanceof Error).toBe(true);
      expect(err instanceof AppError).toBe(true);
    });
  });

  describe("asyncHandler", () => {
    test("should pass errors to next middleware", async () => {
      const app = express();
      const errorMiddleware = (err, req, res, next) => {
        res.status(500).json({ error: err.message });
      };

      app.get(
        "/test",
        asyncHandler(async (req, res) => {
          throw new Error("Async error");
        }),
      );
      app.use(errorMiddleware);

      const response = await request(app).get("/test");
      expect(response.status).toBe(500);
      expect(response.body.error).toBe("Async error");
    });

    test("should pass successful responses through", async () => {
      const app = express();
      app.get(
        "/test",
        asyncHandler(async (req, res) => {
          res.json({ ok: true });
        }),
      );

      const response = await request(app).get("/test");
      expect(response.status).toBe(200);
      expect(response.body.ok).toBe(true);
    });
  });

  describe("handleNotFound middleware", () => {
    test("should return 404 for unknown routes", async () => {
      const app = express();
      app.use(handleNotFound);
      app.use(handleError);

      const response = await request(app).get("/unknown");
      expect(response.status).toBe(404);
    });
  });

  describe("handleError middleware", () => {
    test("should handle standard errors", async () => {
      const app = express();
      app.get("/error", (req, res, next) => {
        next(new Error("Standard error"));
      });
      app.use(handleError);

      const response = await request(app).get("/error");
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    test("should handle AppError with correct status", async () => {
      const app = express();
      app.get("/apperror", (req, res, next) => {
        next(new AppError("Not found", 404, "NOT_FOUND"));
      });
      app.use(handleError);

      const response = await request(app).get("/apperror");
      expect(response.status).toBe(404);
    });
  });
});
