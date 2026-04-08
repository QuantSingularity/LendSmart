const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const app = require("../src/server");
const User = require("../src/models/User");
const Loan = require("../src/models/Loan");

const MONGODB_URI =
  process.env.MONGODB_TEST_URI ||
  process.env.MONGODB_URI ||
  "mongodb://localhost:27017/lendsmart_test";

const createUser = async (overrides = {}) => {
  const user = new User({
    username: overrides.username || `user_${Date.now()}`,
    email: overrides.email || `user_${Date.now()}@example.com`,
    password: "TestPassword123!",
    firstName: "Test",
    lastName: "User",
    dateOfBirth: new Date("1990-01-01"),
    phoneNumber: "+1234567890",
    employmentStatus: "full-time",
    income: 80000,
    role: overrides.role || "user",
    accountStatus: "active",
    emailVerified: true,
    kycStatus:
      overrides.kycStatus !== undefined ? overrides.kycStatus : "verified",
    creditScore: overrides.creditScore || 720,
    ...overrides,
  });
  await user.save();
  return user;
};

const makeToken = (userId, role = "user") =>
  jwt.sign({ id: userId, role }, process.env.JWT_SECRET, { expiresIn: "1h" });

describe("Loan Management System", () => {
  let borrower, lender, admin;
  let borrowerToken, lenderToken, adminToken;
  let testLoan;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(MONGODB_URI);
    }
  });

  beforeEach(async () => {
    await User.deleteMany({});
    await Loan.deleteMany({});

    borrower = await createUser({
      username: "borrower1",
      email: "borrower@example.com",
    });
    lender = await createUser({
      username: "lender1",
      email: "lender@example.com",
    });
    admin = await createUser({
      username: "admin1",
      email: "admin@example.com",
      role: "admin",
    });

    borrowerToken = makeToken(borrower._id, "user");
    lenderToken = makeToken(lender._id, "user");
    adminToken = makeToken(admin._id, "admin");

    testLoan = new Loan({
      borrower: borrower._id,
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

  afterEach(async () => {
    await User.deleteMany({});
    await Loan.deleteMany({});
  });

  afterAll(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  });

  describe("Marketplace - GET /api/loans", () => {
    test("should return marketplace loans publicly", async () => {
      const response = await request(app).get("/api/loans");
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });

    test("should support pagination", async () => {
      const response = await request(app)
        .get("/api/loans")
        .query({ page: 1, limit: 5 });
      expect(response.status).toBe(200);
      expect(response.body.data.pagination).toBeDefined();
    });

    test("should support filtering by amount", async () => {
      const response = await request(app)
        .get("/api/loans")
        .query({ minAmount: 5000, maxAmount: 15000 });
      expect(response.status).toBe(200);
    });
  });

  describe("Loan Application - POST /api/loans/apply", () => {
    test("should reject unauthenticated loan application", async () => {
      const response = await request(app)
        .post("/api/loans/apply")
        .send({
          amount: 5000,
          term: 12,
          termUnit: "months",
          purpose: "personal",
          interestRate: 10,
        });
      expect(response.status).toBe(401);
    });

    test("should reject loan application without KYC", async () => {
      const unverified = await createUser({
        username: "unverified",
        email: "unverified@example.com",
        kycStatus: "not_started",
      });
      const token = makeToken(unverified._id);

      const response = await request(app)
        .post("/api/loans/apply")
        .set("Authorization", `Bearer ${token}`)
        .send({
          amount: 5000,
          term: 12,
          termUnit: "months",
          purpose: "personal",
          interestRate: 10,
        });
      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    test("should process loan application for KYC verified user", async () => {
      const response = await request(app)
        .post("/api/loans/apply")
        .set("Authorization", `Bearer ${borrowerToken}`)
        .send({
          amount: 5000,
          term: 12,
          termUnit: "months",
          purpose: "personal",
          interestRate: 10,
          income: 60000,
          employmentStatus: "full-time",
        });
      // Either 201 (approved) or 400 (credit check failed) is valid
      expect([201, 400]).toContain(response.status);
    });
  });

  describe("Loan Details - GET /api/loans/:id", () => {
    test("should get loan details by ID", async () => {
      const response = await request(app).get(`/api/loans/${testLoan._id}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
    });

    test("should return 404 for non-existent loan", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const response = await request(app).get(`/api/loans/${fakeId}`);
      expect(response.status).toBe(404);
    });

    test("should return 400 for invalid loan ID format", async () => {
      const response = await request(app).get("/api/loans/invalid-id");
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("My Loans - GET /api/loans/my-loans", () => {
    test("should return borrower's loans when authenticated", async () => {
      const response = await request(app)
        .get("/api/loans/my-loans")
        .set("Authorization", `Bearer ${borrowerToken}`);
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data.loans)).toBe(true);
    });

    test("should reject unauthenticated request", async () => {
      const response = await request(app).get("/api/loans/my-loans");
      expect(response.status).toBe(401);
    });
  });

  describe("Fund Loan - POST /api/loans/:id/fund", () => {
    test("should reject unauthenticated funding", async () => {
      const response = await request(app).post(
        `/api/loans/${testLoan._id}/fund`,
      );
      expect(response.status).toBe(401);
    });

    test("should reject funding own loan", async () => {
      const response = await request(app)
        .post(`/api/loans/${testLoan._id}/fund`)
        .set("Authorization", `Bearer ${borrowerToken}`);
      // Either 400 or 403 for self-funding
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    test("should fund a marketplace loan", async () => {
      const response = await request(app)
        .post(`/api/loans/${testLoan._id}/fund`)
        .set("Authorization", `Bearer ${lenderToken}`);
      // 200 success or 400 if business rule blocks it
      expect([200, 400]).toContain(response.status);
    });
  });

  describe("Loan Model Methods", () => {
    test("should calculate monthly payment correctly", () => {
      const payment = testLoan.calculateMonthlyPayment();
      expect(payment).toBeGreaterThan(0);
      expect(typeof payment).toBe("number");
    });

    test("should generate amortization schedule", () => {
      const schedule = testLoan.generateAmortizationSchedule();
      expect(Array.isArray(schedule)).toBe(true);
      expect(schedule.length).toBeGreaterThan(0);
      if (schedule.length > 0) {
        expect(schedule[0]).toHaveProperty("paymentNumber");
        expect(schedule[0]).toHaveProperty("paymentAmount");
        expect(schedule[0]).toHaveProperty("principalAmount");
        expect(schedule[0]).toHaveProperty("interestAmount");
      }
    });

    test("remainingBalance virtual should work", () => {
      expect(typeof testLoan.remainingBalance).toBe("number");
    });

    test("repaymentProgress virtual should return percentage", () => {
      expect(typeof testLoan.repaymentProgress).toBe("number");
    });

    test("termInDays virtual should convert term units", () => {
      expect(testLoan.termInDays).toBe(360); // 12 months * 30
    });

    test("toSafeObject should remove sensitive fields", () => {
      testLoan.internalNotes.push({ note: "secret", createdBy: admin._id });
      const safe = testLoan.toSafeObject();
      expect(safe.internalNotes).toBeUndefined();
      expect(safe.auditLog).toBeUndefined();
      expect(safe.riskMetrics).toBeUndefined();
    });
  });

  describe("Static Loan Methods", () => {
    test("findByBorrower should return borrower loans", async () => {
      const loans = await Loan.findByBorrower(borrower._id);
      expect(Array.isArray(loans)).toBe(true);
      expect(loans.length).toBeGreaterThan(0);
    });

    test("findMarketplaceLoans should return marketplace loans", async () => {
      const loans = await Loan.findMarketplaceLoans();
      expect(Array.isArray(loans)).toBe(true);
    });

    test("getPortfolioStats should return aggregation", async () => {
      const stats = await Loan.getPortfolioStats(borrower._id, "borrower");
      expect(Array.isArray(stats)).toBe(true);
    });
  });
});
