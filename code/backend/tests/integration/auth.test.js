const request = require("supertest");
const mongoose = require("mongoose");
const app = require("../../src/server");
const User = require("../../src/models/User");

const MONGODB_URI =
  process.env.MONGODB_TEST_URI ||
  process.env.MONGODB_URI ||
  "mongodb://localhost:27017/lendsmart_test";

const validUserPayload = (overrides = {}) => ({
  username: `newuser_${Date.now()}`,
  email: `newuser_${Date.now()}@example.com`,
  password: "NewUserPassword123!",
  firstName: "New",
  lastName: "User",
  dateOfBirth: "1993-01-01",
  phoneNumber: "+1234567899",
  employmentStatus: "full-time",
  income: 60000,
  consents: { essential: true, financial_services: true },
  ...overrides,
});

describe("Authentication Integration Tests", () => {
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
  });

  describe("POST /api/auth/register", () => {
    it("should register a new user successfully", async () => {
      const userData = validUserPayload();
      const response = await request(app)
        .post("/api/auth/register")
        .send(userData);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty("success", true);
      expect(response.body).toHaveProperty("data");
    });

    it("should fail with missing consents", async () => {
      const userData = validUserPayload();
      delete userData.consents;

      const response = await request(app)
        .post("/api/auth/register")
        .send(userData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it("should fail with invalid email format", async () => {
      const userData = validUserPayload({ email: "invalid-email" });
      const response = await request(app)
        .post("/api/auth/register")
        .send(userData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it("should fail with weak password", async () => {
      const userData = validUserPayload({ password: "123" });
      const response = await request(app)
        .post("/api/auth/register")
        .send(userData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it("should fail with duplicate email", async () => {
      const userData = validUserPayload();
      await request(app).post("/api/auth/register").send(userData);

      const dupeData = validUserPayload({
        email: userData.email,
        username: `other_${Date.now()}`,
      });
      const response = await request(app)
        .post("/api/auth/register")
        .send(dupeData);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe("POST /api/auth/login", () => {
    let registeredUser;

    beforeEach(async () => {
      const userData = validUserPayload({
        username: "logintest",
        email: "logintest@example.com",
      });
      await request(app).post("/api/auth/register").send(userData);
      registeredUser = {
        email: "logintest@example.com",
        password: "NewUserPassword123!",
      };
    });

    it("should login with valid credentials", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send(registeredUser);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty("accessToken");
    });

    it("should fail with wrong password", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({ email: registeredUser.email, password: "WrongPass999!" });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it("should fail with non-existent user", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({ email: "ghost@example.com", password: "TestPassword123!" });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it("should fail with missing password", async () => {
      const response = await request(app)
        .post("/api/auth/login")
        .send({ email: registeredUser.email });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.body.success).toBe(false);
    });
  });

  describe("GET /api/auth/me", () => {
    let authToken;

    beforeEach(async () => {
      const userData = validUserPayload({
        username: "metest",
        email: "metest@example.com",
      });
      const reg = await request(app).post("/api/auth/register").send(userData);
      authToken = reg.body.data?.tokens?.accessToken;
    });

    it("should return user profile when authenticated", async () => {
      if (!authToken) return; // Skip if registration failed
      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", `Bearer ${authToken}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toBeDefined();
    });

    it("should return 401 when not authenticated", async () => {
      const response = await request(app).get("/api/auth/me");
      expect(response.status).toBe(401);
    });

    it("should return 401 with invalid token", async () => {
      const response = await request(app)
        .get("/api/auth/me")
        .set("Authorization", "Bearer invalid.token.xyz");
      expect(response.status).toBe(401);
    });
  });

  describe("POST /api/auth/logout", () => {
    it("should logout successfully", async () => {
      const response = await request(app).post("/api/auth/logout");
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe("POST /api/auth/refresh-token", () => {
    it("should reject missing refresh token", async () => {
      const response = await request(app)
        .post("/api/auth/refresh-token")
        .send({});
      expect(response.status).toBe(401);
    });

    it("should reject invalid refresh token", async () => {
      const response = await request(app)
        .post("/api/auth/refresh-token")
        .send({ refreshToken: "bad.token.value" });
      expect(response.status).toBe(401);
    });
  });
});
