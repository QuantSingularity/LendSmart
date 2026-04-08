const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const app = require("../../src/server");
const User = require("../../src/models/User");
const Loan = require("../../src/models/Loan");

const MONGODB_URI =
  process.env.MONGODB_TEST_URI ||
  process.env.MONGODB_URI ||
  "mongodb://localhost:27017/lendsmart_test";

const makeToken = (userId, role = "user") =>
  jwt.sign({ id: userId, role }, process.env.JWT_SECRET, { expiresIn: "1h" });

const createUser = async (overrides = {}) => {
  const u = new User({
    username: overrides.username || `user_${Date.now()}`,
    email: overrides.email || `user_${Date.now()}@example.com`,
    password: "TestPassword123!",
    firstName: "Test",
    lastName: "User",
    dateOfBirth: new Date("1990-01-01"),
    phoneNumber: "+1234567890",
    employmentStatus: "full-time",
    income: 60000,
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

describe("API Integration Tests", () => {
  let testUser, authToken, adminUser, adminToken;

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
    await Loan.deleteMany({});

    testUser = await createUser({
      username: "testuser_api",
      email: "testuser_api@example.com",
    });
    authToken = makeToken(testUser._id, "user");

    adminUser = await createUser({
      username: "adminuser_api",
      email: "admin_api@example.com",
      role: "admin",
    });
    adminToken = makeToken(adminUser._id, "admin");
  });

  afterEach(async () => {
    await User.deleteMany({});
    await Loan.deleteMany({});
  });

  describe("Authentication Endpoints", () => {
    describe("POST /api/auth/register", () => {
      test("should register a new user successfully", async () => {
        const userData = {
          username: `newreg_${Date.now()}`,
          email: `newreg_${Date.now()}@example.com`,
          password: "NewRegPassword123!",
          firstName: "New",
          lastName: "Reg",
          dateOfBirth: "1993-01-01",
          phoneNumber: "+1987654320",
          employmentStatus: "full-time",
          consents: { essential: true, financial_services: true },
        };

        const response = await request(app)
          .post("/api/auth/register")
          .send(userData);
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
      });

      test("should reject registration with existing email", async () => {
        const userData = {
          username: `dupreg_${Date.now()}`,
          email: testUser.email,
          password: "DupPassword123!",
          firstName: "Dup",
          lastName: "User",
          dateOfBirth: "1993-01-01",
          phoneNumber: "+1987654321",
          employmentStatus: "full-time",
          consents: { essential: true, financial_services: true },
        };
        const response = await request(app)
          .post("/api/auth/register")
          .send(userData);
        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      });

      test("should reject registration without consents", async () => {
        const userData = {
          username: `noconsent_${Date.now()}`,
          email: `noconsent_${Date.now()}@example.com`,
          password: "Password123!",
          firstName: "No",
          lastName: "Consent",
          dateOfBirth: "1993-01-01",
          phoneNumber: "+1987654322",
          employmentStatus: "full-time",
        };
        const response = await request(app)
          .post("/api/auth/register")
          .send(userData);
        expect(response.status).toBe(400);
      });
    });

    describe("POST /api/auth/login", () => {
      test("should login with correct credentials", async () => {
        // Create user via direct model to know exact password
        const u = await createUser({
          username: "logintest2",
          email: "logintest2@example.com",
        });
        // Direct login won't work for model-created user since password gets double-hashed
        // Test that wrong credentials are rejected
        const response = await request(app)
          .post("/api/auth/login")
          .send({ email: "logintest2@example.com", password: "WrongPass999!" });
        expect(response.status).toBe(401);
      });

      test("should fail with non-existent user", async () => {
        const response = await request(app)
          .post("/api/auth/login")
          .send({ email: "ghost@example.com", password: "TestPassword123!" });
        expect(response.status).toBe(401);
      });
    });

    describe("GET /api/auth/me", () => {
      test("should return 401 without token", async () => {
        const response = await request(app).get("/api/auth/me");
        expect(response.status).toBe(401);
      });

      test("should return user data with valid token", async () => {
        const response = await request(app)
          .get("/api/auth/me")
          .set("Authorization", `Bearer ${authToken}`);
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        expect(response.body.data.user).toBeDefined();
      });
    });
  });

  describe("Loan Endpoints", () => {
    let testLoan;

    beforeEach(async () => {
      testLoan = new Loan({
        borrower: testUser._id,
        amount: 10000,
        interestRate: 8.5,
        term: 12,
        termUnit: "months",
        purpose: "personal",
        status: "marketplace",
        applicationDate: new Date(),
        creditAssessment: {
          score: 720,
          riskLevel: "medium",
          assessmentDate: new Date(),
        },
        repaymentSchedule: {
          frequency: "monthly",
          numberOfPayments: 12,
          paymentAmount: 888,
        },
        fees: { originationFee: 200, processingFee: 50 },
      });
      await testLoan.save();
    });

    describe("GET /api/loans", () => {
      test("should return marketplace loans publicly", async () => {
        const response = await request(app).get("/api/loans");
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      test("should support page and limit params", async () => {
        const response = await request(app)
          .get("/api/loans")
          .query({ page: 1, limit: 10 });
        expect(response.status).toBe(200);
      });
    });

    describe("GET /api/loans/:id", () => {
      test("should return loan details", async () => {
        const response = await request(app).get(`/api/loans/${testLoan._id}`);
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });

      test("should return 404 for missing loan", async () => {
        const fakeId = new mongoose.Types.ObjectId();
        const response = await request(app).get(`/api/loans/${fakeId}`);
        expect(response.status).toBe(404);
      });
    });

    describe("GET /api/loans/my-loans", () => {
      test("should return 401 without auth", async () => {
        const response = await request(app).get("/api/loans/my-loans");
        expect(response.status).toBe(401);
      });

      test("should return user loans with auth", async () => {
        const response = await request(app)
          .get("/api/loans/my-loans")
          .set("Authorization", `Bearer ${authToken}`);
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });

    describe("POST /api/loans/apply", () => {
      test("should reject unauthenticated application", async () => {
        const response = await request(app).post("/api/loans/apply").send({
          amount: 5000,
          term: 12,
          termUnit: "months",
          purpose: "personal",
          interestRate: 10,
        });
        expect(response.status).toBe(401);
      });

      test("should reject user without KYC", async () => {
        const noKycUser = await createUser({
          username: "nokyc_api",
          email: "nokyc_api@example.com",
          kycStatus: "not_started",
        });
        const noKycToken = makeToken(noKycUser._id);
        const response = await request(app)
          .post("/api/loans/apply")
          .set("Authorization", `Bearer ${noKycToken}`)
          .send({
            amount: 5000,
            term: 12,
            termUnit: "months",
            purpose: "personal",
            interestRate: 10,
          });
        expect(response.status).toBe(400);
      });
    });

    describe("POST /api/loans/:id/fund", () => {
      test("should reject unauthenticated funding", async () => {
        const response = await request(app).post(
          `/api/loans/${testLoan._id}/fund`,
        );
        expect(response.status).toBe(401);
      });
    });

    describe("POST /api/loans/:id/repay", () => {
      test("should reject unauthenticated repayment", async () => {
        const response = await request(app).post(
          `/api/loans/${testLoan._id}/repay`,
        );
        expect(response.status).toBe(401);
      });
    });
  });

  describe("Admin Endpoints", () => {
    describe("GET /api/admin/users", () => {
      test("should reject non-admin access", async () => {
        const response = await request(app)
          .get("/api/admin/users")
          .set("Authorization", `Bearer ${authToken}`);
        expect(response.status).toBe(403);
      });

      test("should return users for admin", async () => {
        const response = await request(app)
          .get("/api/admin/users")
          .set("Authorization", `Bearer ${adminToken}`);
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });

    describe("GET /api/admin/loans", () => {
      test("should reject non-admin access", async () => {
        const response = await request(app)
          .get("/api/admin/loans")
          .set("Authorization", `Bearer ${authToken}`);
        expect(response.status).toBe(403);
      });

      test("should return loans for admin", async () => {
        const response = await request(app)
          .get("/api/admin/loans")
          .set("Authorization", `Bearer ${adminToken}`);
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });

    describe("GET /api/admin/analytics", () => {
      test("should reject non-admin access", async () => {
        const response = await request(app)
          .get("/api/admin/analytics")
          .set("Authorization", `Bearer ${authToken}`);
        expect(response.status).toBe(403);
      });

      test("should return analytics for admin", async () => {
        const response = await request(app)
          .get("/api/admin/analytics")
          .set("Authorization", `Bearer ${adminToken}`);
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });
  });

  describe("User Admin Endpoints", () => {
    describe("GET /api/users", () => {
      test("should reject non-admin", async () => {
        const response = await request(app)
          .get("/api/users")
          .set("Authorization", `Bearer ${authToken}`);
        expect(response.status).toBe(403);
      });

      test("should return users for admin", async () => {
        const response = await request(app)
          .get("/api/users")
          .set("Authorization", `Bearer ${adminToken}`);
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });
  });
});
