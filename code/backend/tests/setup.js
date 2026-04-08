const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const Redis = require("redis-mock");
const jwt = require("jsonwebtoken");

/**
 * Test Setup and Configuration
 * Provides test environment setup, mocking, and utilities
 */

class TestSetup {
  constructor() {
    this.mongoServer = null;
    this.testDatabase = null;
    this.redisClient = null;
    this.testUsers = new Map();
    this.testTokens = new Map();
  }

  /**
   * Setup test environment
   */
  async setup() {
    // Set test environment
    process.env.NODE_ENV = "test";
    process.env.JWT_SECRET = "test-jwt-secret-key-for-testing-only";
    process.env.JWT_EXPIRE = "1h";
    process.env.REFRESH_TOKEN_SECRET = "test-refresh-secret-key";
    process.env.REFRESH_TOKEN_EXPIRE = "7d";
    process.env.ENCRYPTION_KEY = "test-encryption-key-32-characters";
    process.env.LOG_LEVEL = "error"; // Reduce log noise during tests

    // Setup in-memory MongoDB
    await this.setupTestDatabase();

    // Setup mock Redis
    this.setupMockRedis();

    // Create test users
    await this.createTestUsers();

    console.log("✅ Test environment setup completed");
  }

  /**
   * Setup in-memory MongoDB for testing
   */
  async setupTestDatabase() {
    try {
      this.mongoServer = await MongoMemoryServer.create({
        instance: {
          dbName: "lendsmart_test",
        },
      });

      const mongoUri = this.mongoServer.getUri();

      await mongoose.connect(mongoUri);

      this.testDatabase = mongoose.connection;

      console.log("✅ Test database connected");
    } catch (error) {
      console.error("❌ Failed to setup test database:", error);
      throw error;
    }
  }

  /**
   * Setup mock Redis client
   */
  setupMockRedis() {
    this.redisClient = Redis.createClient();

    // Mock Redis methods for testing
    global.mockRedis = this.redisClient;

    console.log("✅ Mock Redis setup completed");
  }

  /**
   * Create test users with different roles and statuses
   */
  async createTestUsers() {
    const User = require("../src/models/User");

    const testUserData = [
      {
        username: "testuser",
        email: "test@example.com",
        password: "TestPassword123!",
        firstName: "Test",
        lastName: "User",
        role: "user",
        accountStatus: "active",
        emailVerified: true,
        kycStatus: "verified",
        creditScore: 750,
        dateOfBirth: new Date("1990-01-01"),
        phoneNumber: "+1234567890",
        employmentStatus: "full-time",
        income: 75000,
      },
      {
        username: "testadmin",
        email: "admin@example.com",
        password: "AdminPassword123!",
        firstName: "Test",
        lastName: "Admin",
        role: "admin",
        accountStatus: "active",
        emailVerified: true,
        kycStatus: "verified",
        creditScore: 800,
        dateOfBirth: new Date("1985-01-01"),
        phoneNumber: "+1234567891",
        employmentStatus: "full-time",
        income: 100000,
      },
      {
        username: "testborrower",
        email: "borrower@example.com",
        password: "BorrowerPassword123!",
        firstName: "Test",
        lastName: "Borrower",
        role: "user",
        accountStatus: "active",
        emailVerified: true,
        kycStatus: "verified",
        creditScore: 650,
        dateOfBirth: new Date("1992-01-01"),
        phoneNumber: "+1234567892",
        employmentStatus: "full-time",
        income: 50000,
      },
      {
        username: "testlender",
        email: "lender@example.com",
        password: "LenderPassword123!",
        firstName: "Test",
        lastName: "Lender",
        role: "user",
        accountStatus: "active",
        emailVerified: true,
        kycStatus: "verified",
        creditScore: 780,
        dateOfBirth: new Date("1988-01-01"),
        phoneNumber: "+1234567893",
        employmentStatus: "full-time",
        income: 90000,
      },
      {
        username: "testpending",
        email: "pending@example.com",
        password: "PendingPassword123!",
        firstName: "Test",
        lastName: "Pending",
        role: "user",
        accountStatus: "pending",
        emailVerified: false,
        kycStatus: "not_started",
        creditScore: 600,
        dateOfBirth: new Date("1995-01-01"),
        phoneNumber: "+1234567894",
        employmentStatus: "part-time",
        income: 30000,
      },
    ];

    for (const userData of testUserData) {
      try {
        const user = new User(userData);
        await user.save();

        // Generate test tokens
        const token = jwt.sign(
          { id: user._id, role: user.role },
          process.env.JWT_SECRET,
          {
            expiresIn: process.env.JWT_EXPIRE,
          },
        );

        const refreshToken = jwt.sign(
          { id: user._id },
          process.env.REFRESH_TOKEN_SECRET,
          {
            expiresIn: process.env.REFRESH_TOKEN_EXPIRE,
          },
        );

        this.testUsers.set(userData.username, user);
        this.testTokens.set(userData.username, { token, refreshToken });
      } catch (error) {
        console.error(
          `Failed to create test user ${userData.username}:`,
          error,
        );
      }
    }

    console.log(`✅ Created ${this.testUsers.size} test users`);
  }

  /**
   * Get test user by username
   */
  getTestUser(username) {
    return this.testUsers.get(username);
  }

  /**
   * Get test token for user
   */
  getTestToken(username) {
    return this.testTokens.get(username);
  }

  /**
   * Create test loan data
   */
  async createTestLoan(
    borrowerUsername = "testborrower",
    lenderUsername = null,
  ) {
    const Loan = require("../src/models/Loan");
    const borrower = this.getTestUser(borrowerUsername);
    const lender = lenderUsername ? this.getTestUser(lenderUsername) : null;

    const loanData = {
      borrower: borrower._id,
      lender: lender?._id,
      amount: 10000,
      interestRate: 12.5,
      term: 12,
      termUnit: "months",
      purpose: "debt_consolidation",
      status: lender ? "funded" : "marketplace",
      applicationDate: new Date(),
      fundedDate: lender ? new Date() : null,
      disbursedDate: lender ? new Date() : null,
      creditAssessment: {
        score: borrower.creditScore,
        riskLevel: "medium",
        assessmentDate: new Date(),
      },
      repaymentSchedule: {
        frequency: "monthly",
        numberOfPayments: 12,
        paymentAmount: 888.49,
      },
      fees: {
        originationFee: 200,
        processingFee: 50,
      },
    };

    const loan = new Loan(loanData);
    await loan.save();

    return loan;
  }

  /**
   * Clean up test data
   */
  async cleanup() {
    try {
      // Clear all collections
      if (this.testDatabase) {
        const collections = await this.testDatabase.db.collections();
        for (const collection of collections) {
          await collection.deleteMany({});
        }
      }

      // Close database connections
      if (mongoose.connection.readyState !== 0) {
        await mongoose.connection.close();
      }

      if (this.mongoServer) {
        await this.mongoServer.stop();
      }

      // Clear test data
      this.testUsers.clear();
      this.testTokens.clear();

      console.log("✅ Test cleanup completed");
    } catch (error) {
      console.error("❌ Test cleanup failed:", error);
    }
  }

  /**
   * Reset test database
   */
  async resetDatabase() {
    try {
      const collections = await this.testDatabase.db.collections();
      for (const collection of collections) {
        await collection.deleteMany({});
      }

      // Recreate test users
      await this.createTestUsers();
    } catch (error) {
      console.error("❌ Database reset failed:", error);
      throw error;
    }
  }

  /**
   * Mock external services
   */
  mockExternalServices() {
    // Mock payment processor
    global.mockPaymentProcessor = {
      processPayment: jest.fn().mockResolvedValue({
        success: true,
        transactionId: "mock_txn_123",
        fees: 2.5,
      }),
      refundPayment: jest.fn().mockResolvedValue({
        success: true,
        refundId: "mock_refund_123",
      }),
    };

    // Mock credit bureau
    global.mockCreditBureau = {
      getCreditScore: jest.fn().mockResolvedValue({
        score: 720,
        factors: {
          paymentHistory: 85,
          creditUtilization: 30,
          accountAge: 60,
          creditMix: 75,
        },
      }),
    };

    // Mock notification service
    global.mockNotificationService = {
      sendEmail: jest.fn().mockResolvedValue({ success: true }),
      sendSMS: jest.fn().mockResolvedValue({ success: true }),
      sendPushNotification: jest.fn().mockResolvedValue({ success: true }),
    };

    // Mock blockchain service
    global.mockBlockchainService = {
      createContract: jest.fn().mockResolvedValue({
        contractAddress: "0x1234567890abcdef",
        transactionHash: "0xabcdef1234567890",
      }),
      executeContract: jest.fn().mockResolvedValue({
        success: true,
        transactionHash: "0xfedcba0987654321",
      }),
    };

    console.log("✅ External services mocked");
  }

  /**
   * Create test request object
   */
  createMockRequest(options = {}) {
    return {
      method: options.method || "GET",
      url: options.url || "/",
      originalUrl: options.originalUrl || options.url || "/",
      headers: {
        "user-agent": "test-agent",
        "x-request-id": "test-request-id",
        ...options.headers,
      },
      body: options.body || {},
      query: options.query || {},
      params: options.params || {},
      user: options.user || null,
      ip: options.ip || "127.0.0.1",
      get: jest.fn((header) => options.headers?.[header.toLowerCase()]),
      ...options,
    };
  }

  /**
   * Create test response object
   */
  createMockResponse() {
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      end: jest.fn().mockReturnThis(),
      statusCode: 200,
    };

    return res;
  }

  /**
   * Assert response structure
   */
  assertResponseStructure(response, expectedStructure) {
    for (const key in expectedStructure) {
      expect(response).toHaveProperty(key);

      if (
        typeof expectedStructure[key] === "object" &&
        expectedStructure[key] !== null
      ) {
        this.assertResponseStructure(response[key], expectedStructure[key]);
      }
    }
  }

  /**
   * Generate test data
   */
  generateTestData() {
    return {
      validUser: {
        username: "newuser",
        email: "newuser@example.com",
        password: "NewUserPassword123!",
        firstName: "New",
        lastName: "User",
        dateOfBirth: new Date("1993-01-01"),
        phoneNumber: "+1234567899",
        employmentStatus: "full-time",
        income: 60000,
      },

      validLoan: {
        amount: 15000,
        interestRate: 10.5,
        term: 24,
        termUnit: "months",
        purpose: "home_improvement",
      },

      invalidUser: {
        username: "a", // Too short
        email: "invalid-email",
        password: "123", // Too weak
        firstName: "",
        lastName: "",
      },

      invalidLoan: {
        amount: -1000, // Negative amount
        interestRate: 100, // Too high
        term: 0, // Invalid term
        purpose: "invalid_purpose",
      },
    };
  }
}

// Create singleton instance
const testSetup = new TestSetup();

// testUtils helper for integration tests
const testUtils = {
  createTestUser: (overrides = {}) => ({
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
    accountStatus: overrides.accountStatus || "active",
    emailVerified: true,
    kycStatus: "verified",
    creditScore: 720,
    ...overrides,
  }),
  createTestLoanApplication: (overrides = {}) => ({
    amount: 10000,
    interestRate: 10.5,
    term: 12,
    termUnit: "months",
    purpose: "personal",
    ...overrides,
  }),
  generateTestToken: (payload = {}) => {
    const jwt = require("jsonwebtoken");
    return jwt.sign(
      {
        id: payload.userId || payload.id,
        role: payload.role || "user",
        ...payload,
      },
      process.env.JWT_SECRET ||
        "test-jwt-secret-key-for-testing-only-min32chars",
      { expiresIn: "1h" },
    );
  },
};

// Global test utilities
global.testSetup = testSetup;
global.testUtils = testUtils;

module.exports = testSetup;
module.exports.testUtils = testUtils;
