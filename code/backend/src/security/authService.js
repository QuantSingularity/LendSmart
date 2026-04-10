const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const speakeasy = require("speakeasy");
const QRCode = require("qrcode");
const { promisify } = require("util");
const User = require("../models/User");
const { getEncryptionService } = require("../config/security/encryption");
const { getAuditLogger } = require("../compliance/auditLogger");
const { logger } = require("../utils/logger");

// Redis client with fallback for development
let redisClient;
try {
  redisClient = require("../config/redis");
} catch (error) {
  logger.warn(
    "Redis client not available, using in-memory fallback for development",
  );
  // In-memory fallback for development
  const memoryStore = new Map();
  redisClient = {
    get: async (key) => memoryStore.get(key) || null,
    set: async (key, value) => memoryStore.set(key, value),
    setex: async (key, ttl, value) => {
      memoryStore.set(key, value);
      setTimeout(() => memoryStore.delete(key), ttl * 1000);
    },
    del: async (key) => memoryStore.delete(key),
    incr: async (key) => {
      const current = parseInt(memoryStore.get(key) || "0");
      const newValue = current + 1;
      memoryStore.set(key, newValue.toString());
      return newValue;
    },
    expire: async (key, ttl) => {
      setTimeout(() => memoryStore.delete(key), ttl * 1000);
    },
    ttl: async (key) => {
      // Simplified TTL implementation for development
      return memoryStore.has(key) ? 300 : -1;
    },
  };
}

/**
 * Authentication Service with enterprise security features
 * Implements JWT with refresh tokens, MFA, session management, and security monitoring
 */
class AuthService {
  constructor() {
    this.jwtSecret =
      process.env.JWT_SECRET || "default-jwt-secret-for-development";
    this.refreshSecret =
      process.env.REFRESH_TOKEN_SECRET ||
      "default-refresh-secret-for-development";
    this.jwtExpiry = process.env.JWT_EXPIRE || "15m";
    this.refreshExpiry = process.env.REFRESH_TOKEN_EXPIRE || "7d";
    this.maxLoginAttempts = parseInt(process.env.MAX_LOGIN_ATTEMPTS) || 5;
    this.lockoutDuration = parseInt(process.env.LOCKOUT_DURATION) || 900; // 15 minutes
    this.encryptionService = getEncryptionService();
    this.auditLogger = getAuditLogger();

    // Warn if using default secrets in production
    if (
      process.env.NODE_ENV === "production" &&
      (this.jwtSecret.includes("default") ||
        this.refreshSecret.includes("default"))
    ) {
      logger.error(
        "Using default JWT secrets in production! This is a security risk.",
      );
    }
  }

  /**
   * Register new user with enhanced security
   * @param {Object} userData - User registration data
   * @returns {Object} Registration result with tokens
   */
  async register(userData) {
    try {
      const {
        email,
        password,
        username,
        firstName,
        lastName,
        phoneNumber,
        dateOfBirth,
        employmentStatus,
        income,
        ip,
        userAgent,
      } = userData;

      // Check if user already exists
      const existingUser = await User.findOne({
        $or: [
          { email: email.toLowerCase() },
          { username: username.toLowerCase() },
        ],
      });

      if (existingUser) {
        await this.auditLogger.logAuthEvent({
          action: "registration_failed",
          email,
          username,
          reason: "user_already_exists",
          ip,
          userAgent,
          success: false,
          timestamp: new Date().toISOString(),
        });

        return {
          success: false,
          message: "User already exists with this email or username",
        };
      }

      // Validate password strength
      const passwordValidation = this.validatePasswordStrength(password);
      if (!passwordValidation.isValid) {
        return {
          success: false,
          message: "Password does not meet security requirements",
          requirements: passwordValidation.requirements,
        };
      }

      // Create user - encryption will be handled by model middleware
      const user = new User({
        username: username.toLowerCase(),
        email: email.toLowerCase(),
        password, // Will be hashed by pre-save middleware
        firstName,
        lastName,
        phoneNumber,
        dateOfBirth,
        employmentStatus,
        ...(income !== undefined && { income }),
        accountStatus: "pending",
        emailVerified: false,
        phoneVerified: false,
        kycStatus: "not_started",
        mfaEnabled: false,
        metadata: {
          registrationSource: "web",
          preferredLanguage: "en",
        },
      });

      await user.save();

      // Generate email verification token
      const verificationToken = user.generateEmailVerificationToken();
      await user.save();

      // Generate authentication tokens
      const tokens = await this.generateTokens(user);

      // Store session
      await this.storeSession(user._id, tokens.refreshToken, ip, userAgent);

      // Audit log
      await this.auditLogger.logAuthEvent({
        action: "user_registered",
        userId: user._id,
        username: user.username,
        email: user.email,
        ip,
        userAgent,
        success: true,
        timestamp: new Date().toISOString(),
      });

      // Log registration event
      logger.info("User registered", {
        userId: user._id,
        username: user.username,
        ip,
        userAgent,
      });

      return {
        success: true,
        user: this.sanitizeUser(user),
        tokens,
        verificationToken,
      };
    } catch (error) {
      logger.error("Registration failed", {
        error: error.message,
        userData: { email: userData.email, username: userData.username },
      });

      return {
        success: false,
        message: "Registration failed. Please try again.",
      };
    }
  }

  /**
   * Authenticate user with enhanced security checks
   * @param {Object} credentials - Login credentials
   * @returns {Object} Authentication result
   */
  async login(credentials) {
    try {
      const { email, password, mfaToken, ip, userAgent } = credentials;

      // Check for account lockout
      await this.checkAccountLockout(email);

      // Find user by email or username
      const user = await User.findOne({
        $or: [
          { email: email.toLowerCase() },
          { username: email.toLowerCase() },
        ],
      }).select("+password");

      if (!user) {
        await this.recordFailedAttempt(email, ip);
        await this.auditLogger.logAuthEvent({
          action: "login_failed",
          email,
          reason: "user_not_found",
          ip,
          userAgent,
          success: false,
          timestamp: new Date().toISOString(),
        });

        return {
          success: false,
          message: "Invalid credentials",
        };
      }

      // Verify password
      const isPasswordValid = await user.matchPassword(password);
      if (!isPasswordValid) {
        await this.recordFailedAttempt(email, ip);
        await this.auditLogger.logAuthEvent({
          action: "login_failed",
          userId: user._id,
          email,
          reason: "invalid_password",
          ip,
          userAgent,
          success: false,
          timestamp: new Date().toISOString(),
        });

        return {
          success: false,
          message: "Invalid credentials",
        };
      }

      // Check if account is active
      if (user.accountStatus !== "active" && user.accountStatus !== "pending") {
        await this.auditLogger.logAuthEvent({
          action: "login_failed",
          userId: user._id,
          email,
          reason: "account_inactive",
          ip,
          userAgent,
          success: false,
          timestamp: new Date().toISOString(),
        });

        return {
          success: false,
          message: "Account is deactivated",
        };
      }

      // Check MFA if enabled
      if (user.mfaEnabled) {
        if (!mfaToken) {
          return {
            success: false,
            requiresMFA: true,
            message: "MFA token required",
            tempToken: await this.generateTempToken(user._id),
          };
        }

        const isMFAValid = await this.verifyMFA(user, mfaToken);
        if (!isMFAValid) {
          await this.recordFailedAttempt(email, ip);
          await this.auditLogger.logAuthEvent({
            action: "login_failed",
            userId: user._id,
            email,
            reason: "invalid_mfa_token",
            ip,
            userAgent,
            success: false,
            timestamp: new Date().toISOString(),
          });

          return {
            success: false,
            message: "Invalid MFA token",
          };
        }
      }

      // Clear failed attempts
      await this.clearFailedAttempts(email);

      // Update last login
      user.lastLogin = new Date();
      user.lastLoginIP = ip;
      await user.save();

      // Generate tokens
      const tokens = await this.generateTokens(user);

      // Store session
      await this.storeSession(user._id, tokens.refreshToken, ip, userAgent);

      // Audit log
      await this.auditLogger.logAuthEvent({
        action: "user_login",
        userId: user._id,
        username: user.username,
        email: user.email,
        ip,
        userAgent,
        mfaUsed: !!mfaToken,
        success: true,
        timestamp: new Date().toISOString(),
      });

      // Log successful login
      logger.info("User logged in", {
        userId: user._id,
        username: user.username,
        ip,
        userAgent,
      });

      return {
        success: true,
        user: this.sanitizeUser(user),
        tokens,
      };
    } catch (error) {
      logger.error("Login failed", {
        error: error.message,
        email: credentials.email,
      });

      return {
        success: false,
        message: "Login failed. Please try again.",
      };
    }
  }

  /**
   * Refresh access token using refresh token
   * @param {string} refreshToken - Refresh token
   * @param {string} ip - Client IP address
   * @returns {Object} New tokens
   */
  async refreshToken(refreshToken, ip) {
    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, this.refreshSecret);

      // Check if session exists
      const sessionKey = `session:${decoded.id}:${refreshToken}`;
      const session = await redisClient.get(sessionKey);

      if (!session) {
        throw new Error("Invalid or expired refresh token");
      }

      // Get user
      const user = await User.findById(decoded.id);
      if (
        !user ||
        (user.accountStatus !== "active" && user.accountStatus !== "pending")
      ) {
        throw new Error("User not found or inactive");
      }

      // Generate new tokens
      const tokens = await this.generateTokens(user);

      // Update session with new refresh token
      await redisClient.del(sessionKey);
      await this.storeSession(
        user._id,
        tokens.refreshToken,
        ip,
        JSON.parse(session).userAgent,
      );

      logger.info("Token refreshed", { userId: user._id, ip });

      return {
        success: true,
        tokens,
      };
    } catch (error) {
      logger.error("Token refresh failed", { error: error.message, ip });
      throw new Error("Invalid refresh token");
    }
  }

  /**
   * Logout user and invalidate session
   * @param {string} refreshToken - Refresh token to invalidate
   * @param {string} userId - User ID
   */
  async logout(refreshToken, userId) {
    try {
      if (refreshToken) {
        const sessionKey = `session:${userId}:${refreshToken}`;
        await redisClient.del(sessionKey);
      }

      // Add access token to blacklist if provided
      // This would require storing the jti (JWT ID) in the token

      logger.info("User logged out", { userId });

      return { success: true };
    } catch (error) {
      logger.error("Logout failed", { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Setup Multi-Factor Authentication for user
   * @param {string} userId - User ID
   * @returns {Object} MFA setup data
   */
  async setupMFA(userId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error("User not found");
      }

      // Generate secret
      const secret = speakeasy.generateSecret({
        name: `LendSmart (${user.username})`,
        issuer: "LendSmart",
        length: 32,
      });

      // Store encrypted secret temporarily
      const encryptedSecret = await this.encryptionService.encrypt(
        secret.base32,
      );
      user.mfaTempSecret = encryptedSecret;
      await user.save();

      // Generate QR code
      const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url);

      return {
        secret: secret.base32,
        qrCode: qrCodeUrl,
        backupCodes: await this.generateBackupCodes(userId),
      };
    } catch (error) {
      logger.error("MFA setup failed", { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Verify and enable MFA for user
   * @param {string} userId - User ID
   * @param {string} token - MFA token to verify
   * @returns {Object} Verification result
   */
  async verifyAndEnableMFA(userId, token) {
    try {
      const user = await User.findById(userId);
      if (!user || !user.mfaTempSecret) {
        throw new Error("MFA setup not initiated");
      }

      // Decrypt temporary secret
      const secret = await this.encryptionService.decrypt(user.mfaTempSecret);

      // Verify token
      const verified = speakeasy.totp.verify({
        secret,
        encoding: "base32",
        token,
        window: 2,
      });

      if (!verified) {
        throw new Error("Invalid MFA token");
      }

      // Enable MFA
      user.mfaSecret = user.mfaTempSecret;
      user.mfaEnabled = true;
      user.mfaTempSecret = undefined;
      await user.save();

      logger.info("MFA enabled", { userId });

      return { success: true };
    } catch (error) {
      logger.error("MFA verification failed", { error: error.message, userId });
      throw error;
    }
  }

  /**
   * Verify MFA token
   * @param {Object} user - User object
   * @param {string} token - MFA token
   * @returns {boolean} Verification result
   */
  async verifyMFA(user, token) {
    try {
      if (!user.mfaEnabled || !user.mfaSecret) {
        return false;
      }

      // Decrypt MFA secret
      const secret = await this.encryptionService.decrypt(user.mfaSecret);

      // Verify TOTP token
      const verified = speakeasy.totp.verify({
        secret,
        encoding: "base32",
        token,
        window: 2,
      });

      if (verified) {
        return true;
      }

      // Check backup codes if TOTP fails
      return await this.verifyBackupCode(user._id, token);
    } catch (error) {
      logger.error("MFA verification error", {
        error: error.message,
        userId: user._id,
      });
      return false;
    }
  }

  /**
   * Generate JWT and refresh tokens
   * @param {Object} user - User object
   * @returns {Object} Token pair
   */
  async generateTokens(user) {
    const payload = {
      id: user._id,
      username: user.username,
      role: user.role,
      iat: Math.floor(Date.now() / 1000),
    };

    const accessToken = jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiry,
      issuer: "lendsmart",
      audience: "lendsmart-client",
    });

    const refreshToken = jwt.sign({ id: user._id }, this.refreshSecret, {
      expiresIn: this.refreshExpiry,
      issuer: "lendsmart",
      audience: "lendsmart-client",
    });

    return { accessToken, refreshToken };
  }

  /**
   * Generate temporary token for MFA flow
   * @param {string} userId - User ID
   * @returns {string} Temporary token
   */
  async generateTempToken(userId) {
    const payload = { id: userId, temp: true };
    return jwt.sign(payload, this.jwtSecret, { expiresIn: "5m" });
  }

  /**
   * Store user session in Redis
   * @param {string} userId - User ID
   * @param {string} refreshToken - Refresh token
   * @param {string} ip - Client IP
   * @param {string} userAgent - User agent
   */
  async storeSession(userId, refreshToken, ip, userAgent) {
    const sessionKey = `session:${userId}:${refreshToken}`;
    const sessionData = {
      userId,
      ip,
      userAgent,
      createdAt: new Date().toISOString(),
    };

    // Store session with expiry matching refresh token
    const expiry = this.parseExpiry(this.refreshExpiry);
    await redisClient.setex(sessionKey, expiry, JSON.stringify(sessionData));
  }

  /**
   * Record failed login attempt
   * @param {string} identifier - Email or username
   * @param {string} ip - Client IP
   */
  async recordFailedAttempt(identifier, ip) {
    const key = `failed_attempts:${identifier}`;
    const attempts = await redisClient.incr(key);

    if (attempts === 1) {
      await redisClient.expire(key, this.lockoutDuration);
    }

    logger.warn("Failed login attempt", { identifier, ip, attempts });
  }

  /**
   * Check if account is locked out
   * @param {string} identifier - Email or username
   */
  async checkAccountLockout(identifier) {
    const key = `failed_attempts:${identifier}`;
    const attempts = await redisClient.get(key);

    if (attempts && parseInt(attempts) >= this.maxLoginAttempts) {
      const ttl = await redisClient.ttl(key);
      throw new Error(
        `Account locked. Try again in ${Math.ceil(ttl / 60)} minutes.`,
      );
    }
  }

  /**
   * Clear failed login attempts
   * @param {string} identifier - Email or username
   */
  async clearFailedAttempts(identifier) {
    const key = `failed_attempts:${identifier}`;
    await redisClient.del(key);
  }

  /**
   * Generate backup codes for MFA
   * @param {string} userId - User ID
   * @returns {Array} Backup codes
   */
  async generateBackupCodes(userId) {
    const codes = [];
    for (let i = 0; i < 10; i++) {
      codes.push(crypto.randomBytes(4).toString("hex").toUpperCase());
    }

    // Store encrypted backup codes
    const encryptedCodes = await Promise.all(
      codes.map((code) => this.encryptionService.encrypt(code)),
    );

    const key = `backup_codes:${userId}`;
    await redisClient.setex(key, 86400 * 365, JSON.stringify(encryptedCodes)); // 1 year

    return codes;
  }

  /**
   * Verify backup code
   * @param {string} userId - User ID
   * @param {string} code - Backup code
   * @returns {boolean} Verification result
   */
  async verifyBackupCode(userId, code) {
    try {
      const key = `backup_codes:${userId}`;
      const encryptedCodes = JSON.parse((await redisClient.get(key)) || "[]");

      for (let i = 0; i < encryptedCodes.length; i++) {
        const decryptedCode = await this.encryptionService.decrypt(
          encryptedCodes[i],
        );
        if (decryptedCode === code.toUpperCase()) {
          // Remove used code
          encryptedCodes.splice(i, 1);
          await redisClient.setex(
            key,
            86400 * 365,
            JSON.stringify(encryptedCodes),
          );
          return true;
        }
      }

      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Validate password strength
   * @param {string} password - Password to validate
   * @returns {Object} Validation result with isValid and requirements
   */
  validatePasswordStrength(password) {
    const requirements = [];
    let isValid = true;

    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    if (password.length < minLength) {
      requirements.push("At least 8 characters long");
      isValid = false;
    }

    if (!hasUpperCase) {
      requirements.push("At least one uppercase letter");
      isValid = false;
    }

    if (!hasLowerCase) {
      requirements.push("At least one lowercase letter");
      isValid = false;
    }

    if (!hasNumbers) {
      requirements.push("At least one number");
      isValid = false;
    }

    if (!hasSpecialChar) {
      requirements.push("At least one special character");
      isValid = false;
    }

    return {
      isValid,
      requirements,
    };
  }

  /**
   * Sanitize user object for client response
   * @param {Object} user - User object
   * @returns {Object} Sanitized user
   */
  sanitizeUser(user) {
    const userObj = user.toObject ? user.toObject() : user;
    delete userObj.password;
    delete userObj.mfaSecret;
    delete userObj.mfaTempSecret;
    delete userObj.resetPasswordToken;
    delete userObj.resetPasswordExpire;
    delete userObj.emailVerificationToken;
    delete userObj.emailVerificationExpire;
    return userObj;
  }

  /**
   * Parse expiry string to seconds
   * @param {string} expiry - Expiry string (e.g., '7d', '15m')
   * @returns {number} Seconds
   */
  parseExpiry(expiry) {
    const unit = expiry.slice(-1);
    const value = parseInt(expiry.slice(0, -1));

    switch (unit) {
      case "s":
        return value;
      case "m":
        return value * 60;
      case "h":
        return value * 3600;
      case "d":
        return value * 86400;
      default:
        return 3600; // 1 hour default
    }
  }
}

const authServiceInstance = new AuthService();

module.exports = authServiceInstance;
module.exports.AuthService = AuthService;
module.exports.default = authServiceInstance;
