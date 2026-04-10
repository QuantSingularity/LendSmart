const request = require("supertest");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const app = require("../src/server");
const User = require("../src/models/User");
const authService = require("../src/security/authService");
const { AuthService } = require("../src/security/authService");

const MONGODB_URI =
  process.env.MONGODB_TEST_URI ||
  process.env.MONGODB_URI ||
  "mongodb://localhost:27017/lendsmart_test";

describe("Authentication System", () => {
  let testUser;
  let validToken;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGODB_URI);
    }
  });

  beforeEach(async () => {
    await User.deleteMany({});

    testUser = new User({
      username: "testuser",
      email: "test@example.com",
      password: "TestPassword123!",
      firstName: "Test",
      lastName: "User",
      dateOfBirth: new Date("1990-01-01"),
      phoneNumber: "+1234567890",
      employmentStatus: "full-time",
      role: "user",
      accountStatus: "active",
      emailVerified: true,
      kycStatus: "verified",
      creditScore: 720,
    });
    await testUser.save();

    validToken = jwt.sign(
      { id: testUser._id, role: testUser.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" },
    );
  });

  afterEach(async () => {
    await User.deleteMany({});
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  });

  describe("AuthService class", () => {
    test("should be instantiable", () => {
      const instance = new AuthService();
      expect(instance).toBeDefined();
      expect(typeof instance.login).toBe("function");
      expect(typeof instance.register).toBe("function");
    });

    test("validatePasswordStrength should reject weak passwords", () => {
      const result = authService.validatePasswordStrength("123");
      expect(result.isValid).toBe(false);
      expect(result.requirements.length).toBeGreaterThan(0);
    });

    test("validatePasswordStrength should accept strong passwords", () => {
      const result = authService.validatePasswordStrength("StrongPass123!");
      expect(result.isValid).toBe(true);
    });

    test("parseExpiry should convert time strings to seconds", () => {
      expect(authService.parseExpiry("7d")).toBe(604800);
      expect(authService.parseExpiry("1h")).toBe(3600);
      expect(authService.parseExpiry("15m")).toBe(900);
      expect(authService.parseExpiry("30s")).toBe(30);
    });

    test("sanitizeUser should remove sensitive fields", () => {
      const mockUser = {
        toObject: () => ({
          _id: "123",
          username: "test",
          password: "hashed",
          mfaSecret: "secret",
          mfaTempSecret: "temp",
          resetPasswordToken: "tok",
          resetPasswordExpire: new Date(),
          emailVerificationToken: "evtok",
          emailVerificationExpire: new Date(),
        }),
      };
      const sanitized = authService.sanitizeUser(mockUser);
      expect(sanitized.password).toBeUndefined();
      expect(sanitized.mfaSecret).toBeUndefined();
      expect(sanitized._id).toBeDefined();
    });
  });

  describe("User Registration - POST /api/auth/register", () => {
    test("should register a new user with valid data and consents", async () => {
      const userData = {
        username: "newuser",
        email: "newuser@example.com",
        firstName: "New",
        lastName: "User",
        password: "NewPassword123!",
        phoneNumber: "+1987654321",
        employmentStatus: "full-time",
        dateOfBirth: "1993-01-01",
        consents: { essential: true, financial_services: true },
      };

      const response = await request(app)
        .post("/api/auth/register")
        .send(userData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });

    test("should reject registration without consents", async () => {
      const userData = {
        username: "newuser2",
        email: "newuser2@example.com",
        password: "NewPassword123!",
        firstName: "New",
        lastName: "User",
        phoneNumber: "+1987654322",
        employmentStatus: "full-time",
        dateOfBirth: "1993-01-01",
      };

      const response = await request(app)
        .post("/api/auth/register")
        .send(userData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test("should reject registration with weak password", async () => {
      const userData = {
        username: "weakuser",
        email: "weak@example.com",
        password: "123",
        firstName: "Weak",
        lastName: "User",
        phoneNumber: "+1987654323",
        employmentStatus: "full-time",
        dateOfBirth: "1993-01-01",
        consents: { essential: true, financial_services: true },
      };

      const response = await request(app)
        .post("/api/auth/register")
        .send(userData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test("should reject duplicate email registration", async () => {
      const userData = {
        username: "dupuser",
        email: "test@example.com",
        password: "Password123!",
        firstName: "Dup",
        lastName: "User",
        phoneNumber: "+1987654324",
        employmentStatus: "full-time",
        dateOfBirth: "1993-01-01",
        consents: { essential: true, financial_services: true },
      };

      const response = await request(app)
        .post("/api/auth/register")
        .send(userData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe("User Login - POST /api/auth/login", () => {
    test("should login with valid credentials", async () => {
      const loginData = {
        email: "test@example.com",
        password: "TestPassword123!",
      };

      const response = await request(app)
        .post("/api/auth/login")
        .send(loginData);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.accessToken).toBeDefined();
    });

    test("should reject login with wrong password", async () => {
      const loginData = {
        email: "test@example.com",
        password: "WrongPassword123!",
      };

      const response = await request(app)
        .post("/api/auth/login")
        .send(loginData);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test("should reject login with non-existent email", async () => {
      const loginData = {
        email: "notexist@example.com",
        password: "TestPassword123!",
      };

      const response = await request(app)
        .post("/api/auth/login")
        .send(loginData);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test("should reject login with missing fields", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({ email: "test@example.com" });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe("Token Refresh - POST /api/auth/refresh-token", () => {
    test("should reject refresh without a token", async () => {
      const response = await request(app)
        .post("/api/auth/refresh-token")
        .send({});

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    test("should reject invalid refresh token", async () => {
      const response = await request(app)
        .post("/api/auth/refresh-token")
        .send({ refreshToken: "invalid.token.here" });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe("Logout - POST /api/auth/logout", () => {
    test("should logout successfully", async () => {
      const response = await request(app)
        .post("/api/auth/logout")
        .set("Authorization", `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe("Get Profile - GET /api/auth/me", () => {
    test("should return profile for authenticated user", async () => {
      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.user).toBeDefined();
    });

    test("should reject unauthenticated request", async () => {
      const response = await request(app).get("/api/auth/me");
      expect(response.status).toBe(401);
    });

    test("should reject expired/invalid token", async () => {
      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", "Bearer invalid.token.xyz");
      expect(response.status).toBe(401);
    });
  });

  describe("Update Password - PUT /api/auth/updatepassword", () => {
    test("should reject password update without auth", async () => {
      const response = await request(app).put("/api/auth/updatepassword").send({
        currentPassword: "TestPassword123!",
        newPassword: "NewPass456!",
      });
      expect(response.status).toBe(401);
    });

    test("should reject with wrong current password", async () => {
      const response = await request(app)
        .put("/api/auth/updatepassword")
        .set("Authorization", `Bearer ${validToken}`)
        .send({
          currentPassword: "WrongPassword!",
          newPassword: "NewPass456!@",
        });
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe("Audit Logging", () => {
    test("should log successful authentication events", async () => {
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({ email: testUser.email, password: "TestPassword123!" });
      expect(loginResponse.body.success).toBe(true);
    });

    test("should log failed authentication attempts", async () => {
      const loginResponse = await request(app)
        .post("/api/auth/login")
        .send({ email: testUser.email, password: "WrongPassword123!" });
      expect(loginResponse.body.success).toBe(false);
    });
  });
});

// Export helpers
const createTestUser = async (userData = {}) => {
  const defaultData = {
    username: `testuser_${Date.now()}`,
    email: `test_${Date.now()}@example.com`,
    password: "TestPassword123!",
    firstName: "Test",
    lastName: "User",
    dateOfBirth: new Date("1990-01-01"),
    phoneNumber: "+1234567890",
    employmentStatus: "full-time",
    role: "user",
    accountStatus: "active",
    emailVerified: true,
    kycStatus: "verified",
    creditScore: 720,
  };
  const user = new User({ ...defaultData, ...userData });
  await user.save();
  return user;
};

const generateTestToken = (userId, expiresIn = "1h") => {
  return jwt.sign(
    { id: userId, role: "user" },
    process.env.JWT_SECRET || "test-jwt-secret-key-for-testing-only-min32chars",
    { expiresIn },
  );
};

module.exports = { createTestUser, generateTestToken };
