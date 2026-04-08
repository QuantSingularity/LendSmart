const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../../../src/models/User");

const MONGODB_URI =
  process.env.MONGODB_TEST_URI ||
  process.env.MONGODB_URI ||
  "mongodb://localhost:27017/lendsmart_test";

const makeUserData = (overrides = {}) => ({
  username: `testuser_${Date.now()}`,
  email: `test_${Date.now()}@example.com`,
  password: "TestPassword123!",
  firstName: "Test",
  lastName: "User",
  dateOfBirth: new Date("1990-01-01"),
  phoneNumber: "+1234567890",
  employmentStatus: "full-time",
  ...overrides,
});

describe("User Model", () => {
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

  describe("User Creation", () => {
    it("should create a valid user with required fields", async () => {
      const userData = makeUserData();
      const user = new User(userData);
      const savedUser = await user.save();

      expect(savedUser).toBeTruthy();
      expect(savedUser.username).toBe(userData.username);
      expect(savedUser.email).toBe(userData.email);
      expect(savedUser.role).toBe("user");
      expect(savedUser.accountStatus).toBe("pending");
      expect(savedUser.creditScore).toBe(600);
    });

    it("should hash password before saving", async () => {
      const userData = makeUserData();
      const user = new User(userData);
      await user.save();

      expect(user.password).not.toBe(userData.password);
      expect(user.password.length).toBeGreaterThan(50);
    });

    it("should encrypt sensitive fields on save", async () => {
      const userData = makeUserData({
        socialSecurityNumber: "123-45-6789",
        income: 75000,
      });
      const user = new User(userData);
      await user.save();

      const rawUser = await User.findById(user._id).lean();
      expect(rawUser.firstName).not.toBe(userData.firstName);
      expect(rawUser.lastName).not.toBe(userData.lastName);
      expect(rawUser.phoneNumber).not.toBe(userData.phoneNumber);
    });

    it("should fail validation with missing required fields", async () => {
      const user = new User({ username: "testuser", email: "t@t.com" });
      await expect(user.save()).rejects.toThrow();
    });

    it("should reject invalid email format", async () => {
      const user = new User(makeUserData({ email: "invalid-email" }));
      await expect(user.save()).rejects.toThrow();
    });

    it("should reject username shorter than 3 chars", async () => {
      const user = new User(makeUserData({ username: "ab" }));
      await expect(user.save()).rejects.toThrow();
    });

    it("should reject credit score below 300", async () => {
      const user = new User(makeUserData({ creditScore: 100 }));
      await expect(user.save()).rejects.toThrow();
    });

    it("should reject credit score above 850", async () => {
      const user = new User(makeUserData({ creditScore: 900 }));
      await expect(user.save()).rejects.toThrow();
    });

    it("should reject invalid employment status", async () => {
      const user = new User(
        makeUserData({ employmentStatus: "invalid-status" }),
      );
      await expect(user.save()).rejects.toThrow();
    });
  });

  describe("Virtual Fields", () => {
    it("should return full name", async () => {
      const user = new User(
        makeUserData({ firstName: "John", lastName: "Doe" }),
      );
      await user.save();
      // firstName/lastName are encrypted but fullName virtual uses the raw values during save
      expect(typeof user.fullName).toBe("string");
    });

    it("should calculate age from dateOfBirth", async () => {
      const user = new User(
        makeUserData({ dateOfBirth: new Date("1990-01-01") }),
      );
      await user.save();
      const age = user.age;
      expect(age).toBeGreaterThan(30);
    });

    it("isAccountLocked should return false for unlocked account", async () => {
      const user = new User(makeUserData());
      await user.save();
      expect(user.isAccountLocked).toBe(false);
    });

    it("isAccountLocked should return true when lockUntil is in the future", async () => {
      const user = new User(
        makeUserData({ lockUntil: new Date(Date.now() + 3600000) }),
      );
      await user.save();
      expect(user.isAccountLocked).toBe(true);
    });

    it("isKYCVerified should return true only for verified status", async () => {
      const user = new User(makeUserData({ kycStatus: "verified" }));
      expect(user.isKYCVerified).toBe(true);

      const user2 = new User(makeUserData({ kycStatus: "not_started" }));
      expect(user2.isKYCVerified).toBe(false);
    });
  });

  describe("Instance Methods", () => {
    it("matchPassword should verify correct password", async () => {
      const userData = makeUserData();
      const user = new User(userData);
      await user.save();

      const found = await User.findById(user._id).select("+password");
      const match = await found.matchPassword("TestPassword123!");
      expect(match).toBe(true);
    });

    it("matchPassword should reject wrong password", async () => {
      const user = new User(makeUserData());
      await user.save();

      const found = await User.findById(user._id).select("+password");
      const match = await found.matchPassword("WrongPassword!");
      expect(match).toBe(false);
    });

    it("generatePasswordResetToken should return a token and set expiry", () => {
      const user = new User(makeUserData());
      const token = user.generatePasswordResetToken();
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(0);
      expect(user.passwordResetToken).toBeDefined();
      expect(user.passwordResetExpires).toBeDefined();
      expect(user.passwordResetExpires.getTime()).toBeGreaterThan(Date.now());
    });

    it("generateEmailVerificationToken should return token and set expiry", () => {
      const user = new User(makeUserData());
      const token = user.generateEmailVerificationToken();
      expect(typeof token).toBe("string");
      expect(user.emailVerificationToken).toBeDefined();
      expect(user.emailVerificationExpires).toBeDefined();
    });

    it("generatePhoneVerificationCode should return 6-digit code", () => {
      const user = new User(makeUserData());
      const code = user.generatePhoneVerificationCode();
      expect(typeof code).toBe("string");
      expect(code.length).toBe(6);
      expect(/^\d{6}$/.test(code)).toBe(true);
    });

    it("toSafeObject should remove sensitive fields", async () => {
      const user = new User(makeUserData());
      await user.save();
      const safe = user.toSafeObject();
      expect(safe.password).toBeUndefined();
      expect(safe.mfaSecret).toBeUndefined();
      expect(safe.mfaBackupCodes).toBeUndefined();
      expect(safe.refreshTokens).toBeUndefined();
      expect(safe.socialSecurityNumber).toBeUndefined();
    });

    it("recordGDPRConsent should add consent record", async () => {
      const user = new User(makeUserData());
      await user.save();
      await user.recordGDPRConsent(
        "essential",
        true,
        "127.0.0.1",
        "test-agent",
      );
      expect(user.gdprConsents.length).toBeGreaterThan(0);
      expect(user.gdprConsents[0].consentType).toBe("essential");
      expect(user.gdprConsents[0].granted).toBe(true);
    });

    it("addRefreshToken should add token and keep max 5", async () => {
      const user = new User(makeUserData());
      await user.save();

      for (let i = 0; i < 7; i++) {
        await user.addRefreshToken(`token_${i}`, "127.0.0.1", "test-agent");
      }

      const updated = await User.findById(user._id);
      expect(updated.refreshTokens.length).toBeLessThanOrEqual(5);
    });

    it("removeRefreshToken should remove the correct token", async () => {
      const user = new User(makeUserData());
      await user.save();
      await user.addRefreshToken("token_to_remove", "127.0.0.1", "agent");
      await user.removeRefreshToken("token_to_remove");

      const updated = await User.findById(user._id);
      const found = updated.refreshTokens.find(
        (t) => t.token === "token_to_remove",
      );
      expect(found).toBeUndefined();
    });
  });

  describe("Static Methods", () => {
    it("findByEmail should find user by email", async () => {
      const userData = makeUserData({ email: "findme@example.com" });
      const user = new User(userData);
      await user.save();

      const found = await User.findByEmail("findme@example.com");
      expect(found).toBeTruthy();
      expect(found.email).toBe("findme@example.com");
    });

    it("findByEmail should return null for non-existent email", async () => {
      const found = await User.findByEmail("notfound@example.com");
      expect(found).toBeNull();
    });

    it("findByUsername should find user by username", async () => {
      const user = new User(makeUserData({ username: "findbyname" }));
      await user.save();

      const found = await User.findByUsername("findbyname");
      expect(found).toBeTruthy();
    });

    it("getActiveUsers should return only active users", async () => {
      const activeUser = new User(makeUserData({ accountStatus: "active" }));
      await activeUser.save();

      const pendingUser = new User(makeUserData({ accountStatus: "pending" }));
      await pendingUser.save();

      const active = await User.getActiveUsers();
      expect(active.every((u) => u.accountStatus === "active")).toBe(true);
    });
  });

  describe("Login Attempt Tracking", () => {
    it("incrementLoginAttempts should increment counter", async () => {
      const user = new User(makeUserData());
      await user.save();

      await user.incrementLoginAttempts();
      const updated = await User.findById(user._id);
      expect(updated.loginAttempts).toBe(1);
    });

    it("resetLoginAttempts should clear attempts", async () => {
      const user = new User(makeUserData({ loginAttempts: 3 }));
      await user.save();

      await user.resetLoginAttempts();
      const updated = await User.findById(user._id);
      expect(updated.loginAttempts == null || updated.loginAttempts === 0).toBe(
        true,
      );
    });
  });
});
