const crypto = require("crypto");
const User = require("../models/User");
const authService = require("../security/authService");
const { getAuditLogger } = require("../compliance/auditLogger");
const { getGDPRCompliance } = require("../compliance/gdprCompliance");
const { logger } = require("../utils/logger");

/**
 * Authentication Controller
 * Implements enterprise-grade authentication with security, compliance, and audit features
 */
class AuthController {
  constructor() {
    this.auditLogger = getAuditLogger();
    this.gdprCompliance = getGDPRCompliance();
  }

  /**
   * Register new user
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async register(req, res) {
    try {
      const {
        username,
        email,
        password,
        firstName,
        lastName,
        phoneNumber,
        dateOfBirth,
        employmentStatus,
        income,
        consents,
      } = req.body;
      const ip = req.ip;
      const userAgent = req.get("User-Agent");

      // Validate GDPR consent
      if (!consents || !consents.essential || !consents.financial_services) {
        return res.status(400).json({
          success: false,
          message: "Essential consents are required for registration",
          requiredConsents: ["essential", "financial_services"],
        });
      }

      // Register user
      const registrationData = {
        username,
        email,
        password,
        firstName,
        lastName,
        phoneNumber,
        dateOfBirth,
        employmentStatus,
        income,
        ip,
        userAgent,
      };

      const result = await authService.register(registrationData);

      if (result.success) {
        // Record GDPR consent
        await this.gdprCompliance.recordConsent(
          result.user._id,
          consents,
          ip,
          userAgent,
        );

        // Audit log
        await this.auditLogger.logAuthEvent({
          action: "user_registered",
          userId: result.user._id,
          username: result.user.username,
          email: result.user.email,
          ip,
          userAgent,
          success: true,
          timestamp: new Date().toISOString(),
        });

        // Remove sensitive data from response
        const { verificationToken, ...publicResult } = result;

        res.status(201).json({
          success: true,
          message: "User registered successfully. Please verify your email.",
          data: publicResult,
          nextSteps: {
            emailVerification: true,
            mfaSetup: false,
          },
        });

        // Send verification email (implementation would be in email service)
        // await emailService.sendVerificationEmail(result.user.email, verificationToken);
      } else {
        res.status(400).json({
          success: false,
          message: result.message || "Registration failed",
        });
      }
    } catch (error) {
      logger.error("Registration error", {
        error: error.message,
        stack: error.stack,
        body: { ...req.body, password: "[REDACTED]" },
        ip: req.ip,
      });

      // Audit log for failed registration
      await this.auditLogger.logAuthEvent({
        action: "registration_failed",
        email: req.body.email,
        username: req.body.username,
        error: error.message,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        success: false,
        timestamp: new Date().toISOString(),
      });

      res.status(500).json({
        success: false,
        message: "Registration failed. Please try again.",
        errorCode: "REGISTRATION_ERROR",
      });
    }
  }

  /**
   * User login
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async login(req, res) {
    try {
      const { email, password, mfaToken } = req.body;
      const ip = req.ip;
      const userAgent = req.get("User-Agent");

      const credentials = {
        email,
        password,
        mfaToken,
        ip,
        userAgent,
      };

      const result = await authService.login(credentials);

      if (result.success) {
        // Audit log
        await this.auditLogger.logAuthEvent({
          action: "user_login",
          userId: result.user._id,
          username: result.user.username,
          email: result.user.email,
          ip,
          userAgent,
          mfaUsed: !!mfaToken,
          success: true,
          timestamp: new Date().toISOString(),
        });

        // Set secure HTTP-only cookie for refresh token
        res.cookie("refreshToken", result.tokens.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        res.json({
          success: true,
          message: "Login successful",
          data: {
            user: result.user,
            accessToken: result.tokens.accessToken,
            expiresIn: "15m",
          },
        });
      } else if (result.requiresMFA) {
        res.status(200).json({
          success: false,
          requiresMFA: true,
          message: "MFA token required",
          tempToken: result.tempToken,
        });
      } else {
        res.status(401).json({
          success: false,
          message: "Invalid credentials",
        });
      }
    } catch (error) {
      logger.error("Login error", {
        error: error.message,
        email: req.body.email,
        ip: req.ip,
      });

      // Audit log for failed login
      await this.auditLogger.logAuthEvent({
        action: "login_failed",
        email: req.body.email,
        error: error.message,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        success: false,
        timestamp: new Date().toISOString(),
      });

      res.status(401).json({
        success: false,
        message: error.message || "Login failed",
      });
    }
  }

  /**
   * Refresh access token
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async refreshToken(req, res) {
    try {
      const refreshToken = req.cookies.refreshToken || req.body.refreshToken;
      const ip = req.ip;

      if (!refreshToken) {
        return res.status(401).json({
          success: false,
          message: "Refresh token not provided",
        });
      }

      const result = await authService.refreshToken(refreshToken, ip);

      if (result.success) {
        // Update refresh token cookie
        res.cookie("refreshToken", result.tokens.refreshToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        res.json({
          success: true,
          data: {
            accessToken: result.tokens.accessToken,
            expiresIn: "15m",
          },
        });
      } else {
        res.status(401).json({
          success: false,
          message: "Invalid refresh token",
        });
      }
    } catch (error) {
      logger.error("Token refresh error", {
        error: error.message,
        ip: req.ip,
      });

      res.status(401).json({
        success: false,
        message: "Token refresh failed",
      });
    }
  }

  /**
   * User logout
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async logout(req, res) {
    try {
      const refreshToken = req.cookies.refreshToken;
      const userId = req.user?.id;

      if (refreshToken && userId) {
        await authService.logout(refreshToken, userId);
      }

      // Clear refresh token cookie
      res.clearCookie("refreshToken");

      // Audit log
      if (userId) {
        await this.auditLogger.logAuthEvent({
          action: "user_logout",
          userId,
          ip: req.ip,
          userAgent: req.get("User-Agent"),
          success: true,
          timestamp: new Date().toISOString(),
        });
      }

      res.json({
        success: true,
        message: "Logout successful",
      });
    } catch (error) {
      logger.error("Logout error", {
        error: error.message,
        userId: req.user?.id,
        ip: req.ip,
      });

      res.status(500).json({
        success: false,
        message: "Logout failed",
      });
    }
  }

  /**
   * Setup Multi-Factor Authentication
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async setupMFA(req, res) {
    try {
      const userId = req.user.id;

      const result = await authService.setupMFA(userId);

      // Audit log
      await this.auditLogger.logAuthEvent({
        action: "mfa_setup_initiated",
        userId,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        success: true,
        timestamp: new Date().toISOString(),
      });

      res.json({
        success: true,
        message: "MFA setup initiated",
        data: {
          qrCode: result.qrCode,
          backupCodes: result.backupCodes,
          instructions:
            "Scan the QR code with your authenticator app and verify with a token",
        },
      });
    } catch (error) {
      logger.error("MFA setup error", {
        error: error.message,
        userId: req.user?.id,
        ip: req.ip,
      });

      res.status(500).json({
        success: false,
        message: "MFA setup failed",
      });
    }
  }

  /**
   * Verify and enable MFA
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async verifyMFA(req, res) {
    try {
      const userId = req.user.id;
      const { token } = req.body;

      const result = await authService.verifyAndEnableMFA(userId, token);

      if (result.success) {
        // Audit log
        await this.auditLogger.logAuthEvent({
          action: "mfa_enabled",
          userId,
          ip: req.ip,
          userAgent: req.get("User-Agent"),
          success: true,
          timestamp: new Date().toISOString(),
        });

        res.json({
          success: true,
          message: "MFA enabled successfully",
        });
      } else {
        res.status(400).json({
          success: false,
          message: "Invalid MFA token",
        });
      }
    } catch (error) {
      logger.error("MFA verification error", {
        error: error.message,
        userId: req.user?.id,
        ip: req.ip,
      });

      res.status(400).json({
        success: false,
        message: error.message || "MFA verification failed",
      });
    }
  }

  /**
   * Get current user profile
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getProfile(req, res) {
    try {
      const userId = req.user.id;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Get GDPR consent status
      const consentStatus = await this.gdprCompliance.getConsentStatus(userId);

      // Audit log
      await this.auditLogger.logDataAccess({
        action: "profile_accessed",
        userId,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        timestamp: new Date().toISOString(),
      });

      res.json({
        success: true,
        data: {
          user: authService.sanitizeUser(user),
          consentStatus,
        },
      });
    } catch (error) {
      logger.error("Get profile error", {
        error: error.message,
        userId: req.user?.id,
        ip: req.ip,
      });

      res.status(500).json({
        success: false,
        message: "Failed to get profile",
      });
    }
  }

  /**
   * Update user details
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async updateDetails(req, res) {
    try {
      const userId = req.user.id;
      const { firstName, lastName, phoneNumber, address, metadata } = req.body;

      const fieldsToUpdate = {};
      if (firstName !== undefined) fieldsToUpdate.firstName = firstName;
      if (lastName !== undefined) fieldsToUpdate.lastName = lastName;
      if (phoneNumber !== undefined) fieldsToUpdate.phoneNumber = phoneNumber;
      if (address !== undefined) fieldsToUpdate.address = address;
      if (metadata !== undefined) fieldsToUpdate.metadata = metadata;

      const user = await User.findByIdAndUpdate(userId, fieldsToUpdate, {
        new: true,
        runValidators: true,
      });

      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      await this.auditLogger.logDataAccess({
        action: "profile_updated",
        userId,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        timestamp: new Date().toISOString(),
      });

      res.json({
        success: true,
        message: "Profile updated successfully",
        data: { user: authService.sanitizeUser(user) },
      });
    } catch (error) {
      logger.error("Update details error", {
        error: error.message,
        userId: req.user?.id,
      });
      res
        .status(500)
        .json({ success: false, message: "Failed to update profile" });
    }
  }

  /**
   * Update user password
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async updatePassword(req, res) {
    try {
      const userId = req.user.id;
      const { currentPassword, newPassword } = req.body;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: "Current password and new password are required",
        });
      }

      const user = await User.findById(userId).select("+password");
      if (!user) {
        return res
          .status(404)
          .json({ success: false, message: "User not found" });
      }

      const isMatch = await user.matchPassword(currentPassword);
      if (!isMatch) {
        return res
          .status(400)
          .json({ success: false, message: "Current password is incorrect" });
      }

      user.password = newPassword;
      await user.save();

      await this.auditLogger.logAuthEvent({
        action: "password_changed",
        userId,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        success: true,
        timestamp: new Date().toISOString(),
      });

      res.json({ success: true, message: "Password updated successfully" });
    } catch (error) {
      logger.error("Update password error", {
        error: error.message,
        userId: req.user?.id,
      });
      res
        .status(500)
        .json({ success: false, message: "Failed to update password" });
    }
  }
}

module.exports = new AuthController();
