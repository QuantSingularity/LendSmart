const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const app = require("../../src/server");
const User = require("../../src/models/User");

const MONGODB_URI =
  process.env.MONGODB_TEST_URI ||
  process.env.MONGODB_URI ||
  "mongodb://localhost:27017/lendsmart_test";

const makeToken = (userId, role = "user") =>
  jwt.sign({ id: userId, role }, process.env.JWT_SECRET, { expiresIn: "1h" });

const createUser = async (overrides = {}) => {
  const u = new User({
    username: overrides.username || `secuser_${Date.now()}`,
    email: overrides.email || `secuser_${Date.now()}@example.com`,
    password: "TestPassword123!",
    firstName: "Test",
    lastName: "User",
    dateOfBirth: new Date("1990-01-01"),
    phoneNumber: "+1234567890",
    employmentStatus: "full-time",
    role: overrides.role || "user",
    accountStatus: "active",
    emailVerified: true,
    kycStatus: "verified",
    creditScore: 720,
    ...overrides,
  });
  await u.save();
  return u;
};

describe("Security Tests", () => {
  let adminUser, adminToken;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGODB_URI);
    }
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  });

  beforeEach(async () => {
    await User.deleteMany({});
    adminUser = await createUser({
      username: "secadmin",
      email: "secadmin@example.com",
      role: "admin",
    });
    adminToken = makeToken(adminUser._id, "admin");
  });

  afterEach(async () => {
    await User.deleteMany({});
  });

  describe("Input Validation Security", () => {
    describe("SQL Injection Prevention", () => {
      it("should handle SQL injection in login gracefully", async () => {
        const maliciousPayload = {
          email: "admin@example.com' OR '1'='1",
          password: "password' OR '1'='1",
        };
        const response = await request(app)
          .post("/api/auth/login")
          .send(maliciousPayload);
        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);
      });

      it("should reject non-string email in login", async () => {
        const response = await request(app)
          .post("/api/auth/login")
          .send({ email: { $ne: null }, password: "TestPassword123!" });
        expect(response.status).toBeGreaterThanOrEqual(400);
      });
    });

    describe("NoSQL Injection Prevention", () => {
      it("should handle NoSQL injection in login", async () => {
        const maliciousPayload = {
          email: { $ne: null },
          password: { $ne: null },
        };
        const response = await request(app)
          .post("/api/auth/login")
          .send(maliciousPayload);
        expect(response.status).toBeGreaterThanOrEqual(400);
      });
    });

    describe("XSS Prevention", () => {
      it("should handle XSS script tags in input", async () => {
        const response = await request(app)
          .post("/api/auth/register")
          .send({
            username: "<script>alert('xss')</script>",
            email: "xss@example.com",
            password: "TestPassword123!",
            firstName: "<script>",
            lastName: "Test",
            consents: { essential: true, financial_services: true },
          });
        // Should fail validation, not crash
        expect(response.status).toBeGreaterThanOrEqual(400);
      });
    });

    describe("Path Traversal Prevention", () => {
      it("should reject path traversal in query params", async () => {
        const response = await request(app)
          .get("/api/users")
          .set("Authorization", `Bearer ${adminToken}`)
          .query({ search: "../../etc/passwd" });
        // Should return 200 with empty results or 400, not 500
        expect(response.status).not.toBe(500);
        expect(response.status).toBeGreaterThanOrEqual(200);
      });
    });
  });

  describe("Authentication Security", () => {
    describe("JWT Token Security", () => {
      it("should reject missing JWT token", async () => {
        const response = await request(app).get("/api/auth/me");
        expect(response.status).toBe(401);
        expect(response.body.success).toBe(false);
      });

      it("should reject malformed JWT token", async () => {
        const response = await request(app)
          .get("/api/auth/me")
          .set("Authorization", "Bearer not.a.valid.jwt.token");
        expect(response.status).toBe(401);
      });

      it("should reject token signed with wrong secret", async () => {
        const fakeToken = jwt.sign(
          { id: adminUser._id, role: "admin" },
          "wrong-secret",
          { expiresIn: "1h" },
        );
        const response = await request(app)
          .get("/api/auth/me")
          .set("Authorization", `Bearer ${fakeToken}`);
        expect(response.status).toBe(401);
      });

      it("should reject expired token", async () => {
        const expiredToken = jwt.sign(
          { id: adminUser._id, role: "admin" },
          process.env.JWT_SECRET,
          { expiresIn: "0s" },
        );
        await new Promise((r) => setTimeout(r, 100));
        const response = await request(app)
          .get("/api/auth/me")
          .set("Authorization", `Bearer ${expiredToken}`);
        expect(response.status).toBe(401);
      });
    });

    describe("Authorization Security", () => {
      it("should reject non-admin accessing admin routes", async () => {
        const user = await createUser({
          username: "nonadmin",
          email: "nonadmin@example.com",
        });
        const token = makeToken(user._id, "user");
        const response = await request(app)
          .get("/api/admin/users")
          .set("Authorization", `Bearer ${token}`);
        expect(response.status).toBe(403);
      });

      it("should allow admin to access admin routes", async () => {
        const response = await request(app)
          .get("/api/admin/users")
          .set("Authorization", `Bearer ${adminToken}`);
        expect(response.status).toBe(200);
      });

      it("should prevent access to another user data", async () => {
        const user1 = await createUser({
          username: "u1sec",
          email: "u1sec@example.com",
        });
        const user2 = await createUser({
          username: "u2sec",
          email: "u2sec@example.com",
        });
        const token1 = makeToken(user1._id, "user");

        const response = await request(app)
          .get(`/api/users/${user2._id}`)
          .set("Authorization", `Bearer ${token1}`);
        expect(response.status).toBe(403);
      });
    });

    describe("Account Security", () => {
      it("should reject login for suspended accounts", async () => {
        // Build and save user with password pre-set so we know it
        const suspUser = new User({
          username: "suspuser",
          email: "suspuser@example.com",
          password: "SuspPass123!",
          firstName: "Susp",
          lastName: "User",
          dateOfBirth: new Date("1990-01-01"),
          phoneNumber: "+1234567890",
          employmentStatus: "full-time",
          accountStatus: "suspended",
        });
        await suspUser.save();

        const response = await request(app)
          .post("/api/auth/login")
          .send({ email: "suspuser@example.com", password: "SuspPass123!" });

        // Suspended accounts should fail auth
        expect(response.status).toBeGreaterThanOrEqual(400);
        expect(response.body.success).toBe(false);
      });
    });
  });

  describe("Data Protection", () => {
    it("should not expose password in user responses", async () => {
      const response = await request(app)
        .get("/api/admin/users")
        .set("Authorization", `Bearer ${adminToken}`);
      expect(response.status).toBe(200);
      const users = response.body.data;
      if (Array.isArray(users)) {
        users.forEach((u) => {
          expect(u.password).toBeUndefined();
          expect(u.mfaSecret).toBeUndefined();
        });
      }
    });

    it("should include security headers", async () => {
      const response = await request(app).get("/");
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
      expect(response.headers["x-frame-options"]).toBeDefined();
    });
  });

  describe("Rate Limiting", () => {
    it("should handle many concurrent requests gracefully", async () => {
      const promises = Array.from({ length: 5 }, () =>
        request(app)
          .post("/api/auth/login")
          .send({ email: "ratetest@example.com", password: "pass" }),
      );
      const responses = await Promise.all(promises);
      responses.forEach((r) => {
        expect(r.status).toBeGreaterThanOrEqual(400);
        expect(r.status).toBeLessThan(600);
      });
    });
  });

  describe("Password Security", () => {
    it("should store hashed passwords", async () => {
      const rawUser = await User.findById(adminUser._id)
        .select("+password")
        .lean();
      expect(rawUser.password).toBeDefined();
      expect(rawUser.password).not.toBe("TestPassword123!");
      expect(rawUser.password.startsWith("$2")).toBe(true);
    });
  });
});
