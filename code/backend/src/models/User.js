const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { getEncryptionService } = require("../config/security/encryption");
const { logger } = require("../utils/logger");

/**
 * User Model
 * Implements enterprise-grade user management with security and compliance features
 */
const userSchema = new mongoose.Schema(
  {
    // Basic Information
    username: {
      type: String,
      required: [true, "Username is required"],
      unique: true,
      trim: true,
      minlength: [3, "Username must be at least 3 characters"],
      maxlength: [30, "Username cannot exceed 30 characters"],
      match: [
        /^[a-zA-Z0-9_]+$/,
        "Username can only contain letters, numbers, and underscores",
      ],
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        "Please enter a valid email",
      ],
    },

    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false, // Don't include password in queries by default
    },

    // Personal Information (Encrypted)
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
      maxlength: [500, "First name cannot exceed 50 characters"],
    },

    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
      maxlength: [500, "Last name cannot exceed 50 characters"],
    },

    dateOfBirth: {
      type: Date,
      required: [true, "Date of birth is required"],
    },

    // Contact Information (Encrypted)
    phoneNumber: {
      type: String,
      required: [true, "Phone number is required"],
    },

    address: {
      street: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      zipCode: { type: String, trim: true },
      country: { type: String, trim: true, default: "US" },
    },

    // Financial Information (Encrypted)
    income: {
      type: Number,
      min: [0, "Income cannot be negative"],
    },

    employmentStatus: {
      type: String,
      enum: [
        "full-time",
        "part-time",
        "contract",
        "self-employed",
        "unemployed",
        "student",
        "retired",
      ],
      required: [true, "Employment status is required"],
    },

    employer: {
      type: String,
      trim: true,
      maxlength: [100, "Employer name cannot exceed 100 characters"],
    },

    // Identity Verification
    socialSecurityNumber: {
      type: String,
      match: [/^\d{3}-?\d{2}-?\d{4}$/, "Please enter a valid SSN format"],
    },

    // Account Status
    role: {
      type: String,
      enum: ["user", "admin", "risk-assessor", "support"],
      default: "user",
    },

    accountStatus: {
      type: String,
      enum: ["active", "suspended", "closed", "pending"],
      default: "pending",
    },

    // Verification Status
    emailVerified: {
      type: Boolean,
      default: false,
    },

    phoneVerified: {
      type: Boolean,
      default: false,
    },

    kycStatus: {
      type: String,
      enum: ["not_started", "pending", "verified", "rejected"],
      default: "not_started",
    },

    kycDocuments: [
      {
        type: {
          type: String,
          enum: [
            "passport",
            "drivers_license",
            "national_id",
            "utility_bill",
            "bank_statement",
          ],
        },
        documentId: String,
        status: {
          type: String,
          enum: ["pending", "approved", "rejected"],
          default: "pending",
        },
        uploadedAt: {
          type: Date,
          default: Date.now,
        },
        reviewedAt: Date,
        reviewedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
      },
    ],

    // Credit Information
    creditScore: {
      type: Number,
      min: [300, "Credit score cannot be below 300"],
      max: [850, "Credit score cannot exceed 850"],
      default: 600,
    },

    creditScoreLastUpdated: {
      type: Date,
      default: Date.now,
    },

    // Security Features
    mfaEnabled: {
      type: Boolean,
      default: false,
    },

    mfaSecret: {
      type: String,
      select: false,
    },

    mfaBackupCodes: [
      {
        code: String,
        used: {
          type: Boolean,
          default: false,
        },
        usedAt: Date,
      },
    ],

    // Session Management
    refreshTokens: [
      {
        token: String,
        createdAt: {
          type: Date,
          default: Date.now,
        },
        expiresAt: Date,
        ipAddress: String,
        userAgent: String,
        isActive: {
          type: Boolean,
          default: true,
        },
      },
    ],

    // Security Tracking
    lastLogin: Date,
    lastLoginIP: String,
    loginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: Date,

    passwordResetToken: String,
    passwordResetExpires: Date,
    passwordChangedAt: Date,

    // Email Verification
    emailVerificationToken: String,
    emailVerificationExpires: Date,

    // Phone Verification
    phoneVerificationCode: String,
    phoneVerificationExpires: Date,

    // Blockchain Integration
    walletAddress: {
      type: String,
      unique: true,
      sparse: true,
      match: [
        /^0x[a-fA-F0-9]{40}$/,
        "Please enter a valid Ethereum wallet address",
      ],
    },

    // Privacy and Compliance
    gdprConsents: [
      {
        consentType: {
          type: String,
          enum: ["essential", "analytics", "marketing", "financial_services"],
        },
        granted: Boolean,
        grantedAt: Date,
        ipAddress: String,
        userAgent: String,
      },
    ],

    dataRetentionPolicy: {
      type: String,
      enum: ["standard", "extended", "minimal"],
      default: "standard",
    },

    // Audit Trail
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // Metadata
    metadata: {
      registrationSource: String,
      referralCode: String,
      marketingOptIn: {
        type: Boolean,
        default: false,
      },
      preferredLanguage: {
        type: String,
        default: "en",
      },
      timezone: String,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Indexes for performance
userSchema.index({ email: 1 });
userSchema.index({ username: 1 });
userSchema.index({ walletAddress: 1 }, { sparse: true });
userSchema.index({ kycStatus: 1 });
userSchema.index({ accountStatus: 1 });
userSchema.index({ creditScore: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ lastLogin: -1 });

// Compound indexes
userSchema.index({ email: 1, accountStatus: 1 });
userSchema.index({ kycStatus: 1, accountStatus: 1 });

// Virtual fields
userSchema.virtual("fullName").get(function () {
  return `${this.firstName} ${this.lastName}`;
});

userSchema.virtual("age").get(function () {
  if (!this.dateOfBirth) return null;
  const today = new Date();
  const birthDate = new Date(this.dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (
    monthDiff < 0 ||
    (monthDiff === 0 && today.getDate() < birthDate.getDate())
  ) {
    age--;
  }
  return age;
});

userSchema.virtual("isAccountLocked").get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

userSchema.virtual("isKYCVerified").get(function () {
  return this.kycStatus === "verified";
});

// Pre-save middleware
userSchema.pre("save", async function (next) {
  // Validate phone number before encryption
  if (this.isModified("phoneNumber") && this.phoneNumber) {
    const phoneRegex = /^\+?[\d\s\-\(\)]+$/;
    if (!phoneRegex.test(this.phoneNumber)) {
      return next(new Error("Please enter a valid phone number"));
    }
  }

  // Hash password if modified
  if (this.isModified("password")) {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    this.passwordChangedAt = new Date();
  }

  // Encrypt sensitive fields
  if (
    this.isModified("firstName") ||
    this.isModified("lastName") ||
    this.isModified("phoneNumber") ||
    this.isModified("socialSecurityNumber") ||
    this.isModified("income")
  ) {
    const encryptionService = getEncryptionService();

    if (this.isModified("firstName")) {
      this.firstName = await encryptionService.encrypt(this.firstName);
    }
    if (this.isModified("lastName")) {
      this.lastName = await encryptionService.encrypt(this.lastName);
    }
    if (this.isModified("phoneNumber")) {
      this.phoneNumber = await encryptionService.encrypt(this.phoneNumber);
    }
    if (this.isModified("socialSecurityNumber") && this.socialSecurityNumber) {
      this.socialSecurityNumber = await encryptionService.encrypt(
        this.socialSecurityNumber,
      );
    }
    if (this.isModified("income") && this.income) {
      this.income = await encryptionService.encrypt(this.income.toString());
    }
  }

  next();
});

// Post-find middleware to decrypt sensitive fields
userSchema.post(["find", "findOne", "findOneAndUpdate"], async function (docs) {
  if (!docs) return;

  const documents = Array.isArray(docs) ? docs : [docs];
  const encryptionService = getEncryptionService();

  for (const doc of documents) {
    if (doc && typeof doc.toObject === "function") {
      try {
        if (doc.firstName) {
          doc.firstName = await encryptionService.decrypt(doc.firstName);
        }
        if (doc.lastName) {
          doc.lastName = await encryptionService.decrypt(doc.lastName);
        }
        if (doc.phoneNumber) {
          doc.phoneNumber = await encryptionService.decrypt(doc.phoneNumber);
        }
        if (doc.socialSecurityNumber) {
          doc.socialSecurityNumber = await encryptionService.decrypt(
            doc.socialSecurityNumber,
          );
        }
        if (doc.income && typeof doc.income === "string") {
          doc.income = parseFloat(await encryptionService.decrypt(doc.income));
        }
      } catch (error) {
        logger.error("Decryption error:", { error: error.message });
      }
    }
  }
});

// Instance methods
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

userSchema.methods.generatePasswordResetToken = function () {
  const resetToken = crypto.randomBytes(20).toString("hex");
  this.passwordResetToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  return resetToken;
};

userSchema.methods.generateEmailVerificationToken = function () {
  const verificationToken = crypto.randomBytes(20).toString("hex");
  this.emailVerificationToken = crypto
    .createHash("sha256")
    .update(verificationToken)
    .digest("hex");
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  return verificationToken;
};

userSchema.methods.generatePhoneVerificationCode = function () {
  const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
  this.phoneVerificationCode = crypto
    .createHash("sha256")
    .update(code)
    .digest("hex");
  this.phoneVerificationExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  return code;
};

userSchema.methods.incrementLoginAttempts = function () {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 },
    });
  }

  const updates = { $inc: { loginAttempts: 1 } };

  // Lock account after 5 failed attempts for 2 hours
  if (
    this.loginAttempts + 1 >= 5 &&
    !(this.lockUntil && this.lockUntil > Date.now())
  ) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }

  return this.updateOne(updates);
};

userSchema.methods.resetLoginAttempts = function () {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 },
  });
};

userSchema.methods.addRefreshToken = function (token, ipAddress, userAgent) {
  this.refreshTokens.push({
    token,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    ipAddress,
    userAgent,
    isActive: true,
  });

  // Keep only the last 5 refresh tokens
  if (this.refreshTokens.length > 5) {
    this.refreshTokens = this.refreshTokens.slice(-5);
  }

  return this.save();
};

userSchema.methods.removeRefreshToken = function (token) {
  this.refreshTokens = this.refreshTokens.filter((rt) => rt.token !== token);
  return this.save();
};

userSchema.methods.updateCreditScore = async function () {
  // This would integrate with credit scoring service
  // For now, just update the timestamp
  this.creditScoreLastUpdated = new Date();
  return this.save();
};

userSchema.methods.recordGDPRConsent = function (
  consentType,
  granted,
  ipAddress,
  userAgent,
) {
  // Remove existing consent of the same type
  this.gdprConsents = this.gdprConsents.filter(
    (consent) => consent.consentType !== consentType,
  );

  // Add new consent record
  this.gdprConsents.push({
    consentType,
    granted,
    grantedAt: new Date(),
    ipAddress,
    userAgent,
  });

  return this.save();
};

userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();

  // Remove sensitive fields
  delete obj.password;
  delete obj.mfaSecret;
  delete obj.mfaBackupCodes;
  delete obj.refreshTokens;
  delete obj.passwordResetToken;
  delete obj.emailVerificationToken;
  delete obj.phoneVerificationCode;
  delete obj.socialSecurityNumber;
  delete obj.loginAttempts;
  delete obj.lockUntil;

  return obj;
};

// Static methods
userSchema.statics.findByEmail = function (email) {
  return this.findOne({ email: email.toLowerCase() });
};

userSchema.statics.findByUsername = function (username) {
  return this.findOne({ username });
};

userSchema.statics.findByWalletAddress = function (walletAddress) {
  return this.findOne({ walletAddress });
};

userSchema.statics.getActiveUsers = function () {
  return this.find({ accountStatus: "active" });
};

userSchema.statics.getVerifiedUsers = function () {
  return this.find({
    accountStatus: "active",
    emailVerified: true,
    kycStatus: "verified",
  });
};

module.exports = mongoose.model("User", userSchema);
