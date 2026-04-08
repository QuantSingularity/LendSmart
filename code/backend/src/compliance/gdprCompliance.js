const crypto = require("crypto");
const { getEncryptionService } = require("../config/security/encryption");
const { getAuditLogger } = require("./auditLogger");
const User = require("../models/User");
const Loan = require("../models/Loan");
const { logger } = require("../utils/logger");

// Redis with in-memory fallback
let redisClient;
try {
  redisClient = require("../config/redis");
} catch (error) {
  const store = new Map();
  redisClient = {
    get: async (k) => store.get(k) || null,
    setex: async (k, ttl, v) => {
      store.set(k, v);
      setTimeout(() => store.delete(k), ttl * 1000);
      return "OK";
    },
    setEx: async (k, ttl, v) => {
      store.set(k, v);
      setTimeout(() => store.delete(k), ttl * 1000);
      return "OK";
    },
    del: async (k) => {
      store.delete(k);
      return 1;
    },
  };
}

/**
 * GDPR Compliance Module
 * Implements data privacy rights and compliance requirements
 */
class GDPRCompliance {
  constructor() {
    this.encryptionService = getEncryptionService();
    this.auditLogger = getAuditLogger();
    this.dataRetentionPolicies = this.setupRetentionPolicies();
    this.consentTypes = this.setupConsentTypes();
  }

  /**
   * Setup data retention policies
   * @returns {Object} Retention policies by data type
   */
  setupRetentionPolicies() {
    return {
      user_profile: {
        retention_period: "7_years", // Financial regulation requirement
        auto_delete: false, // Manual review required
        anonymize_after: "2_years",
      },
      financial_data: {
        retention_period: "7_years",
        auto_delete: false,
        anonymize_after: null, // Never anonymize financial data
      },
      marketing_data: {
        retention_period: "2_years",
        auto_delete: true,
        anonymize_after: "1_year",
      },
      session_data: {
        retention_period: "30_days",
        auto_delete: true,
        anonymize_after: null,
      },
      audit_logs: {
        retention_period: "7_years",
        auto_delete: false,
        anonymize_after: null,
      },
    };
  }

  /**
   * Setup consent types and purposes
   * @returns {Object} Consent types configuration
   */
  setupConsentTypes() {
    return {
      essential: {
        name: "Essential Services",
        description: "Required for basic platform functionality",
        required: true,
        withdrawable: false,
      },
      financial_services: {
        name: "Financial Services",
        description: "Processing loans and financial transactions",
        required: true,
        withdrawable: false,
      },
      marketing: {
        name: "Marketing Communications",
        description: "Promotional emails and product updates",
        required: false,
        withdrawable: true,
      },
      analytics: {
        name: "Analytics and Insights",
        description: "Platform improvement and user experience analytics",
        required: false,
        withdrawable: true,
      },
      third_party_sharing: {
        name: "Third Party Data Sharing",
        description:
          "Sharing data with credit bureaus and verification services",
        required: false,
        withdrawable: true,
      },
    };
  }

  /**
   * Record user consent
   * @param {string} userId - User ID
   * @param {Object} consents - Consent preferences
   * @param {string} ip - User IP address
   * @param {string} userAgent - User agent string
   * @returns {Object} Consent record
   */
  async recordConsent(userId, consents, ip, userAgent) {
    try {
      const consentRecord = {
        userId,
        consents,
        timestamp: new Date().toISOString(),
        ip,
        userAgent,
        consentId: crypto.randomUUID(),
        version: "1.0", // Consent form version
      };

      // Store consent record in Redis with encryption
      const encryptedRecord = await this.encryptionService.encrypt(
        JSON.stringify(consentRecord),
        "consent_record",
      );

      const consentKey = `consent:${userId}:${consentRecord.consentId}`;
      await redisClient.setex(consentKey, 86400 * 365 * 7, encryptedRecord); // 7 years

      // Store current consent status
      const currentConsentKey = `current_consent:${userId}`;
      await redisClient.setex(
        currentConsentKey,
        86400 * 365 * 7,
        JSON.stringify(consents),
      );

      // Audit log
      await this.auditLogger.logDataAccess({
        action: "consent_recorded",
        userId,
        consents,
        ip,
        userAgent,
        consentId: consentRecord.consentId,
      });

      logger.info("User consent recorded", {
        userId,
        consentId: consentRecord.consentId,
        consents: Object.keys(consents),
      });

      return {
        success: true,
        consentId: consentRecord.consentId,
        timestamp: consentRecord.timestamp,
      };
    } catch (error) {
      logger.error("Failed to record consent", {
        error: error.message,
        userId,
      });
      throw new Error("Failed to record consent");
    }
  }

  /**
   * Get user consent status
   * @param {string} userId - User ID
   * @returns {Object} Current consent status
   */
  async getConsentStatus(userId) {
    try {
      const consentKey = `current_consent:${userId}`;
      const consentData = await redisClient.get(consentKey);

      if (!consentData) {
        return {
          hasConsent: false,
          consents: {},
          lastUpdated: null,
        };
      }

      const consents = JSON.parse(consentData);

      return {
        hasConsent: true,
        consents,
        consentTypes: this.consentTypes,
        lastUpdated: consents.timestamp || null,
      };
    } catch (error) {
      logger.error("Failed to get consent status", {
        error: error.message,
        userId,
      });
      throw new Error("Failed to retrieve consent status");
    }
  }

  /**
   * Update user consent preferences
   * @param {string} userId - User ID
   * @param {Object} newConsents - Updated consent preferences
   * @param {string} ip - User IP address
   * @param {string} userAgent - User agent string
   * @returns {Object} Update result
   */
  async updateConsent(userId, newConsents, ip, userAgent) {
    try {
      // Get current consent
      const currentConsent = await this.getConsentStatus(userId);

      // Record new consent
      const result = await this.recordConsent(
        userId,
        newConsents,
        ip,
        userAgent,
      );

      // Check for withdrawn consents and trigger data handling
      if (currentConsent.hasConsent) {
        const withdrawnConsents = this.findWithdrawnConsents(
          currentConsent.consents,
          newConsents,
        );

        if (withdrawnConsents.length > 0) {
          await this.handleConsentWithdrawal(userId, withdrawnConsents);
        }
      }

      return result;
    } catch (error) {
      logger.error("Failed to update consent", {
        error: error.message,
        userId,
      });
      throw new Error("Failed to update consent");
    }
  }

  /**
   * Find withdrawn consents
   * @param {Object} oldConsents - Previous consent preferences
   * @param {Object} newConsents - New consent preferences
   * @returns {Array} List of withdrawn consent types
   */
  findWithdrawnConsents(oldConsents, newConsents) {
    const withdrawn = [];

    for (const [consentType, oldValue] of Object.entries(oldConsents)) {
      const newValue = newConsents[consentType];
      if (oldValue === true && newValue === false) {
        withdrawn.push(consentType);
      }
    }

    return withdrawn;
  }

  /**
   * Handle consent withdrawal
   * @param {string} userId - User ID
   * @param {Array} withdrawnConsents - List of withdrawn consent types
   */
  async handleConsentWithdrawal(userId, withdrawnConsents) {
    try {
      for (const consentType of withdrawnConsents) {
        switch (consentType) {
          case "marketing":
            await this.removeMarketingData(userId);
            break;
          case "analytics":
            await this.anonymizeAnalyticsData(userId);
            break;
          case "third_party_sharing":
            await this.revokeThirdPartyAccess(userId);
            break;
        }
      }

      // Audit log
      await this.auditLogger.logDataAccess({
        action: "consent_withdrawn",
        userId,
        withdrawnConsents,
        timestamp: new Date().toISOString(),
      });

      logger.info("Consent withdrawal processed", {
        userId,
        withdrawnConsents,
      });
    } catch (error) {
      logger.error("Failed to handle consent withdrawal", {
        error: error.message,
        userId,
        withdrawnConsents,
      });
    }
  }

  /**
   * Export user data (Right to Data Portability)
   * @param {string} userId - User ID
   * @param {string} format - Export format (json, csv, xml)
   * @returns {Object} Exported data
   */
  async exportUserData(userId, format = "json") {
    try {
      // Verify user consent for data export
      const consentStatus = await this.getConsentStatus(userId);
      if (!consentStatus.hasConsent) {
        throw new Error("User consent required for data export");
      }

      // Collect user data from various sources
      const userData = await this.collectUserData(userId);

      // Decrypt sensitive fields for export
      const decryptedData = await this.decryptUserData(userData);

      // Format data according to request
      const formattedData = await this.formatExportData(decryptedData, format);

      // Create export record
      const exportRecord = {
        exportId: crypto.randomUUID(),
        userId,
        format,
        timestamp: new Date().toISOString(),
        dataTypes: Object.keys(userData),
        recordCount: this.countRecords(userData),
      };

      // Store export record
      const exportKey = `data_export:${userId}:${exportRecord.exportId}`;
      await redisClient.setex(
        exportKey,
        86400 * 30,
        JSON.stringify(exportRecord),
      ); // 30 days

      // Audit log
      await this.auditLogger.logDataAccess({
        action: "data_exported",
        userId,
        exportId: exportRecord.exportId,
        format,
        dataTypes: exportRecord.dataTypes,
        recordCount: exportRecord.recordCount,
      });

      logger.info("User data exported", {
        userId,
        exportId: exportRecord.exportId,
        format,
        recordCount: exportRecord.recordCount,
      });

      return {
        success: true,
        exportId: exportRecord.exportId,
        data: formattedData,
        metadata: {
          exportedAt: exportRecord.timestamp,
          format,
          recordCount: exportRecord.recordCount,
        },
      };
    } catch (error) {
      logger.error("Failed to export user data", {
        error: error.message,
        userId,
        format,
      });
      throw new Error("Failed to export user data");
    }
  }

  /**
   * Delete user data (Right to Erasure)
   * @param {string} userId - User ID
   * @param {Object} options - Deletion options
   * @returns {Object} Deletion result
   */
  async deleteUserData(userId, options = {}) {
    try {
      const {
        deleteFinancialData = false,
        anonymizeInstead = true,
        reason = "user_request",
      } = options;

      // Check if user has active loans
      const activeLoans = await Loan.find({
        $or: [{ borrower: userId }, { lender: userId }],
        status: { $in: ["active", "funded", "pending_approval"] },
      });

      if (activeLoans.length > 0 && deleteFinancialData) {
        throw new Error("Cannot delete data while user has active loans");
      }

      const deletionRecord = {
        deletionId: crypto.randomUUID(),
        userId,
        timestamp: new Date().toISOString(),
        reason,
        deleteFinancialData,
        anonymizeInstead,
        deletedData: {},
      };

      // Delete or anonymize different data types
      if (anonymizeInstead) {
        deletionRecord.deletedData = await this.anonymizeUserData(userId);
      } else {
        deletionRecord.deletedData = await this.hardDeleteUserData(
          userId,
          deleteFinancialData,
        );
      }

      // Store deletion record
      const deletionKey = `data_deletion:${userId}:${deletionRecord.deletionId}`;
      await redisClient.setex(
        deletionKey,
        86400 * 365 * 7,
        JSON.stringify(deletionRecord),
      ); // 7 years

      // Audit log
      await this.auditLogger.logDataAccess({
        action: "data_deleted",
        userId,
        deletionId: deletionRecord.deletionId,
        reason,
        deleteFinancialData,
        anonymizeInstead,
        deletedDataTypes: Object.keys(deletionRecord.deletedData),
      });

      logger.info("User data deletion completed", {
        userId,
        deletionId: deletionRecord.deletionId,
        anonymizeInstead,
        deletedDataTypes: Object.keys(deletionRecord.deletedData),
      });

      return {
        success: true,
        deletionId: deletionRecord.deletionId,
        deletedAt: deletionRecord.timestamp,
        anonymized: anonymizeInstead,
        deletedDataTypes: Object.keys(deletionRecord.deletedData),
      };
    } catch (error) {
      logger.error("Failed to delete user data", {
        error: error.message,
        userId,
      });
      throw new Error("Failed to delete user data");
    }
  }

  /**
   * Collect all user data from various sources
   * @param {string} userId - User ID
   * @returns {Object} Collected user data
   */
  async collectUserData(userId) {
    const userData = {};

    // User profile data
    const user = await User.findById(userId);
    if (user) {
      userData.profile = user.toObject();
    }

    // Loan data
    const loans = await Loan.find({
      $or: [{ borrower: userId }, { lender: userId }],
    });
    userData.loans = loans.map((loan) => loan.toObject());

    // Consent records
    const consentKeys = await redisClient.keys(`consent:${userId}:*`);
    userData.consents = [];
    for (const key of consentKeys) {
      const encryptedConsent = await redisClient.get(key);
      if (encryptedConsent) {
        try {
          const decryptedConsent = await this.encryptionService.decrypt(
            encryptedConsent,
            "consent_record",
          );
          userData.consents.push(JSON.parse(decryptedConsent));
        } catch (error) {
          // Skip corrupted consent records
        }
      }
    }

    // Session data
    const sessionKeys = await redisClient.keys(`session:${userId}:*`);
    userData.sessions = [];
    for (const key of sessionKeys) {
      const sessionData = await redisClient.get(key);
      if (sessionData) {
        userData.sessions.push(JSON.parse(sessionData));
      }
    }

    return userData;
  }

  /**
   * Decrypt user data for export
   * @param {Object} userData - Encrypted user data
   * @returns {Object} Decrypted user data
   */
  async decryptUserData(userData) {
    const decrypted = { ...userData };

    // Decrypt user profile fields
    if (decrypted.profile) {
      const encryptedFields = ["email", "firstName", "lastName", "phoneNumber"];
      decrypted.profile = await this.encryptionService.decryptFields(
        decrypted.profile,
        encryptedFields,
      );
    }

    return decrypted;
  }

  /**
   * Format exported data according to requested format
   * @param {Object} data - Data to format
   * @param {string} format - Export format
   * @returns {string|Object} Formatted data
   */
  async formatExportData(data, format) {
    switch (format.toLowerCase()) {
      case "json":
        return JSON.stringify(data, null, 2);
      case "csv":
        return this.convertToCSV(data);
      case "xml":
        return this.convertToXML(data);
      default:
        return data;
    }
  }

  /**
   * Convert data to CSV format
   * @param {Object} data - Data to convert
   * @returns {string} CSV formatted data
   */
  convertToCSV(data) {
    // Simplified CSV conversion
    // In production, use a proper CSV library
    const csvLines = [];

    for (const [section, sectionData] of Object.entries(data)) {
      csvLines.push(`\n[${section.toUpperCase()}]`);

      if (Array.isArray(sectionData)) {
        if (sectionData.length > 0) {
          const headers = Object.keys(sectionData[0]);
          csvLines.push(headers.join(","));

          for (const item of sectionData) {
            const values = headers.map((header) =>
              JSON.stringify(item[header] || ""),
            );
            csvLines.push(values.join(","));
          }
        }
      } else if (typeof sectionData === "object") {
        for (const [key, value] of Object.entries(sectionData)) {
          csvLines.push(`${key},${JSON.stringify(value)}`);
        }
      }
    }

    return csvLines.join("\n");
  }

  /**
   * Convert data to XML format
   * @param {Object} data - Data to convert
   * @returns {string} XML formatted data
   */
  convertToXML(data) {
    // Simplified XML conversion
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<userData>\n';

    for (const [section, sectionData] of Object.entries(data)) {
      xml += `  <${section}>\n`;
      xml += this.objectToXML(sectionData, 4);
      xml += `  </${section}>\n`;
    }

    xml += "</userData>";
    return xml;
  }

  /**
   * Convert object to XML recursively
   * @param {*} obj - Object to convert
   * @param {number} indent - Indentation level
   * @returns {string} XML string
   */
  objectToXML(obj, indent = 0) {
    const spaces = " ".repeat(indent);
    let xml = "";

    if (Array.isArray(obj)) {
      for (const item of obj) {
        xml += `${spaces}<item>\n`;
        xml += this.objectToXML(item, indent + 2);
        xml += `${spaces}</item>\n`;
      }
    } else if (typeof obj === "object" && obj !== null) {
      for (const [key, value] of Object.entries(obj)) {
        xml += `${spaces}<${key}>`;
        if (typeof value === "object") {
          xml += "\n";
          xml += this.objectToXML(value, indent + 2);
          xml += `${spaces}`;
        } else {
          xml += this.escapeXML(String(value));
        }
        xml += `</${key}>\n`;
      }
    } else {
      xml += `${spaces}${this.escapeXML(String(obj))}\n`;
    }

    return xml;
  }

  /**
   * Escape XML special characters
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  escapeXML(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /**
   * Count total records in user data
   * @param {Object} userData - User data
   * @returns {number} Total record count
   */
  countRecords(userData) {
    let count = 0;

    for (const [key, value] of Object.entries(userData)) {
      if (Array.isArray(value)) {
        count += value.length;
      } else if (typeof value === "object" && value !== null) {
        count += 1;
      }
    }

    return count;
  }

  /**
   * Anonymize user data instead of deleting
   * @param {string} userId - User ID
   * @returns {Object} Anonymization result
   */
  async anonymizeUserData(userId) {
    const anonymized = {};

    // Anonymize user profile
    const user = await User.findById(userId);
    if (user) {
      user.email = `anonymized_${crypto.randomBytes(8).toString("hex")}@example.com`;
      user.firstName = "Anonymized";
      user.lastName = "User";
      user.phoneNumber = null;
      user.address = null;
      user.dateOfBirth = null;
      user.isActive = false;

      await user.save();
      anonymized.profile = true;
    }

    // Remove session data
    const sessionKeys = await redisClient.keys(`session:${userId}:*`);
    for (const key of sessionKeys) {
      await redisClient.del(key);
    }
    anonymized.sessions = sessionKeys.length;

    // Remove marketing consent data
    await this.removeMarketingData(userId);
    anonymized.marketing = true;

    return anonymized;
  }

  /**
   * Hard delete user data
   * @param {string} userId - User ID
   * @param {boolean} includeFinancial - Whether to delete financial data
   * @returns {Object} Deletion result
   */
  async hardDeleteUserData(userId, includeFinancial = false) {
    const deleted = {};

    if (includeFinancial) {
      // Delete user completely
      await User.findByIdAndDelete(userId);
      deleted.profile = true;

      // Delete loans where user is the only party
      const deletedLoans = await Loan.deleteMany({
        $or: [
          { borrower: userId, lender: null },
          { lender: userId, borrower: null },
        ],
      });
      deleted.loans = deletedLoans.deletedCount;
    } else {
      // Just anonymize
      return await this.anonymizeUserData(userId);
    }

    // Delete all Redis data
    const allKeys = await redisClient.keys(`*:${userId}:*`);
    for (const key of allKeys) {
      await redisClient.del(key);
    }
    deleted.redisKeys = allKeys.length;

    return deleted;
  }

  /**
   * Remove marketing data
   * @param {string} userId - User ID
   */
  async removeMarketingData(userId) {
    // Remove from marketing lists, email subscriptions, etc.
    // Implementation would integrate with marketing systems
    logger.info("Marketing data removed", { userId });
  }

  /**
   * Anonymize analytics data
   * @param {string} userId - User ID
   */
  async anonymizeAnalyticsData(userId) {
    // Anonymize user in analytics systems
    // Implementation would integrate with analytics platforms
    logger.info("Analytics data anonymized", { userId });
  }

  /**
   * Revoke third-party access
   * @param {string} userId - User ID
   */
  async revokeThirdPartyAccess(userId) {
    // Revoke access tokens, notify third parties, etc.
    // Implementation would integrate with third-party systems
    logger.info("Third-party access revoked", { userId });
  }
}

// Singleton instance
let gdprCompliance = null;

/**
 * Get GDPR compliance instance
 * @returns {GDPRCompliance} GDPR compliance singleton
 */
function getGDPRCompliance() {
  if (!gdprCompliance) {
    gdprCompliance = new GDPRCompliance();
  }
  return gdprCompliance;
}

module.exports = {
  GDPRCompliance,
  getGDPRCompliance,
};
