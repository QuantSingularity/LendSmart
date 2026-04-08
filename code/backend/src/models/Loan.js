const mongoose = require("mongoose");
const { getEncryptionService } = require("../config/security/encryption");
const { logger } = require("../utils/logger");

/**
 * Loan Model
 * Implements enterprise-grade loan management with security, compliance, and blockchain integration
 */
const loanSchema = new mongoose.Schema(
  {
    // Basic Loan Information
    borrower: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Borrower is required"],
      index: true,
    },

    lender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },

    amount: {
      type: Number,
      required: [true, "Loan amount is required"],
      min: [100, "Minimum loan amount is $100"],
      max: [1000000, "Maximum loan amount is $1,000,000"],
    },

    interestRate: {
      type: Number,
      required: [true, "Interest rate is required"],
      min: [0.1, "Interest rate must be at least 0.1%"],
      max: [50, "Interest rate cannot exceed 50%"],
    },

    term: {
      type: Number,
      required: [true, "Loan term is required"],
      min: [1, "Loan term must be at least 1"],
    },

    termUnit: {
      type: String,
      enum: ["days", "weeks", "months", "years"],
      required: [true, "Term unit is required"],
      default: "months",
    },

    purpose: {
      type: String,
      required: [true, "Loan purpose is required"],
      enum: [
        "debt_consolidation",
        "home_improvement",
        "business",
        "education",
        "medical",
        "auto",
        "personal",
        "investment",
        "emergency",
        "other",
      ],
    },

    // Loan Status and Lifecycle
    status: {
      type: String,
      enum: [
        "pending_approval", // Initial application state
        "approved", // Approved by admin/system
        "rejected", // Rejected by admin/system
        "marketplace", // Available for funding in marketplace
        "funded", // Funded by lender
        "active", // Loan is active and being repaid
        "repaid", // Fully repaid
        "defaulted", // In default
        "cancelled", // Cancelled before funding
      ],
      default: "pending_approval",
      index: true,
    },

    // Important Dates
    applicationDate: {
      type: Date,
      default: Date.now,
      index: true,
    },

    approvedDate: Date,
    rejectedDate: Date,
    fundedDate: Date,
    disbursedDate: Date,
    maturityDate: Date,
    repaidDate: Date,
    defaultedDate: Date,

    // Financial Details
    amountFunded: {
      type: Number,
      min: [0, "Funded amount cannot be negative"],
    },

    amountRepaid: {
      type: Number,
      default: 0,
      min: [0, "Repaid amount cannot be negative"],
    },

    totalAmountDue: {
      type: Number,
      min: [0, "Total amount due cannot be negative"],
    },

    // Collateral Information
    collateral: {
      type: {
        type: String,
        enum: [
          "none",
          "real_estate",
          "vehicle",
          "securities",
          "crypto",
          "other",
        ],
      },
      description: String,
      estimatedValue: Number,
      documents: [
        {
          documentType: String,
          documentId: String,
          uploadedAt: {
            type: Date,
            default: Date.now,
          },
        },
      ],
    },

    // Credit Assessment
    creditAssessment: {
      score: {
        type: Number,
        min: [300, "Credit score cannot be below 300"],
        max: [850, "Credit score cannot exceed 850"],
      },
      riskLevel: {
        type: String,
        enum: ["low", "medium", "high", "very-high"],
      },
      assessmentDate: Date,
      assessedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      factors: {
        debtToIncomeRatio: Number,
        employmentStability: Number,
        paymentHistory: Number,
        accountAge: Number,
      },
    },

    // Repayment Information
    repaymentSchedule: {
      frequency: {
        type: String,
        enum: ["weekly", "bi-weekly", "monthly", "quarterly"],
        default: "monthly",
      },
      numberOfPayments: Number,
      paymentAmount: Number,
      nextPaymentDate: Date,
      lastPaymentDate: Date,
    },

    repayments: [
      {
        amount: {
          type: Number,
          required: true,
          min: [0, "Repayment amount cannot be negative"],
        },
        principalAmount: {
          type: Number,
          min: [0, "Principal amount cannot be negative"],
        },
        interestAmount: {
          type: Number,
          min: [0, "Interest amount cannot be negative"],
        },
        paymentDate: {
          type: Date,
          required: true,
        },
        dueDate: Date,
        isLate: {
          type: Boolean,
          default: false,
        },
        lateFee: {
          type: Number,
          default: 0,
          min: [0, "Late fee cannot be negative"],
        },
        paymentMethod: {
          type: String,
          enum: [
            "bank_transfer",
            "credit_card",
            "debit_card",
            "crypto",
            "check",
            "cash",
          ],
        },
        transactionId: String,
        processedAt: Date,
        notes: String,
      },
    ],

    // Payment Processing
    paymentDetails: {
      processorType: {
        type: String,
        enum: ["stripe", "paypal", "bank_transfer", "crypto", "other"],
      },
      processorTransactionId: String,
      processorFees: Number,
      currency: {
        type: String,
        default: "USD",
      },
      exchangeRate: Number,
    },

    // Blockchain Integration
    blockchainContract: {
      contractAddress: String,
      transactionHash: String,
      blockchainNetwork: {
        type: String,
        enum: ["ethereum", "polygon", "bsc", "avalanche"],
        default: "ethereum",
      },
      createdAt: Date,
      isActive: {
        type: Boolean,
        default: true,
      },
    },

    // Legal and Compliance
    legalDocuments: [
      {
        documentType: {
          type: String,
          enum: [
            "loan_agreement",
            "promissory_note",
            "security_agreement",
            "disclosure",
            "other",
          ],
        },
        documentId: String,
        signedAt: Date,
        signedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        ipAddress: String,
        userAgent: String,
      },
    ],

    // Risk Management
    riskMetrics: {
      probabilityOfDefault: Number,
      lossGivenDefault: Number,
      expectedLoss: Number,
      riskAdjustedReturn: Number,
      lastUpdated: Date,
    },

    // Fees and Charges
    fees: {
      originationFee: {
        type: Number,
        default: 0,
        min: [0, "Origination fee cannot be negative"],
      },
      processingFee: {
        type: Number,
        default: 0,
        min: [0, "Processing fee cannot be negative"],
      },
      lateFee: {
        type: Number,
        default: 0,
        min: [0, "Late fee cannot be negative"],
      },
      prepaymentPenalty: {
        type: Number,
        default: 0,
        min: [0, "Prepayment penalty cannot be negative"],
      },
    },

    // Communication and Notes
    communications: [
      {
        type: {
          type: String,
          enum: ["email", "sms", "call", "letter", "in_app"],
        },
        direction: {
          type: String,
          enum: ["inbound", "outbound"],
        },
        subject: String,
        content: String,
        sentAt: Date,
        sentBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        receivedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        status: {
          type: String,
          enum: ["sent", "delivered", "read", "failed"],
        },
      },
    ],

    internalNotes: [
      {
        note: String,
        createdAt: {
          type: Date,
          default: Date.now,
        },
        createdBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        isPrivate: {
          type: Boolean,
          default: true,
        },
      },
    ],

    // Audit Trail
    auditLog: [
      {
        action: String,
        performedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        performedAt: {
          type: Date,
          default: Date.now,
        },
        details: mongoose.Schema.Types.Mixed,
        ipAddress: String,
        userAgent: String,
      },
    ],

    // Metadata
    metadata: {
      source: {
        type: String,
        enum: ["web", "mobile", "api", "admin"],
        default: "web",
      },
      referralCode: String,
      campaignId: String,
      tags: [String],
      customFields: mongoose.Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Indexes for performance
loanSchema.index({ borrower: 1, status: 1 });
loanSchema.index({ lender: 1, status: 1 });
loanSchema.index({ status: 1, applicationDate: -1 });
loanSchema.index({ amount: 1, interestRate: 1 });
loanSchema.index({ maturityDate: 1 });
loanSchema.index({ "repaymentSchedule.nextPaymentDate": 1 });
loanSchema.index({ "creditAssessment.riskLevel": 1 });
loanSchema.index({ purpose: 1 });
loanSchema.index({ createdAt: -1 });

// Compound indexes
loanSchema.index({ status: 1, amount: 1, interestRate: 1 });
loanSchema.index({ borrower: 1, status: 1, createdAt: -1 });
loanSchema.index({ lender: 1, status: 1, createdAt: -1 });

// Text index for search
loanSchema.index({
  purpose: "text",
  "internalNotes.note": "text",
  "communications.subject": "text",
  "communications.content": "text",
});

// Virtual fields
loanSchema.virtual("remainingBalance").get(function () {
  if (!this.totalAmountDue) return this.amount;
  return Math.max(0, this.totalAmountDue - (this.amountRepaid || 0));
});

loanSchema.virtual("repaymentProgress").get(function () {
  if (!this.totalAmountDue || this.totalAmountDue === 0) return 0;
  return Math.min(100, ((this.amountRepaid || 0) / this.totalAmountDue) * 100);
});

loanSchema.virtual("daysToMaturity").get(function () {
  if (!this.maturityDate) return null;
  const today = new Date();
  const maturity = new Date(this.maturityDate);
  const diffTime = maturity - today;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

loanSchema.virtual("isOverdue").get(function () {
  if (!this.repaymentSchedule.nextPaymentDate) return false;
  return new Date() > new Date(this.repaymentSchedule.nextPaymentDate);
});

loanSchema.virtual("termInDays").get(function () {
  const multipliers = {
    days: 1,
    weeks: 7,
    months: 30,
    years: 365,
  };
  return this.term * (multipliers[this.termUnit] || 30);
});

// Pre-save middleware
loanSchema.pre("save", async function (next) {
  // Calculate maturity date if not set
  if (!this.maturityDate && this.fundedDate) {
    const fundedDate = new Date(this.fundedDate);
    const termInDays = this.termInDays;
    this.maturityDate = new Date(
      fundedDate.getTime() + termInDays * 24 * 60 * 60 * 1000,
    );
  }

  // Calculate total amount due if not set
  if (!this.totalAmountDue && this.amount && this.interestRate && this.term) {
    const principal = this.amount;
    const rate = this.interestRate / 100;
    const timeInYears = this.termInDays / 365;

    // Simple interest calculation (can be enhanced for compound interest)
    const interest = principal * rate * timeInYears;
    this.totalAmountDue =
      principal + interest + (this.fees.originationFee || 0);
  }

  // Update status based on repayment
  if (this.amountRepaid && this.totalAmountDue) {
    if (this.amountRepaid >= this.totalAmountDue && this.status === "active") {
      this.status = "repaid";
      this.repaidDate = new Date();
    }
  }

  // Encrypt sensitive notes
  if (this.isModified("internalNotes")) {
    const encryptionService = getEncryptionService();
    for (const note of this.internalNotes) {
      if (note.isModified && note.isModified("note")) {
        note.note = await encryptionService.encrypt(note.note);
      }
    }
  }

  next();
});

// Post-find middleware to decrypt sensitive fields
loanSchema.post(["find", "findOne", "findOneAndUpdate"], async function (docs) {
  if (!docs) return;

  const documents = Array.isArray(docs) ? docs : [docs];
  const encryptionService = getEncryptionService();

  for (const doc of documents) {
    if (doc && doc.internalNotes) {
      for (const note of doc.internalNotes) {
        try {
          if (note.note) {
            note.note = await encryptionService.decrypt(note.note);
          }
        } catch (error) {
          logger.error("Note decryption error:", { error: error.message });
        }
      }
    }
  }
});

// Instance methods
loanSchema.methods.addRepayment = function (repaymentData) {
  const { amount, paymentMethod, transactionId, dueDate } = repaymentData;

  // Calculate principal and interest portions
  const remainingBalance = this.remainingBalance;
  const totalInterest = this.totalAmountDue - this.amount;
  const interestPortion = Math.min(
    amount,
    totalInterest * (remainingBalance / this.totalAmountDue),
  );
  const principalPortion = amount - interestPortion;

  // Check if payment is late
  const isLate = dueDate ? new Date() > new Date(dueDate) : false;

  const repayment = {
    amount,
    principalAmount: principalPortion,
    interestAmount: interestPortion,
    paymentDate: new Date(),
    dueDate,
    isLate,
    lateFee: isLate ? this.fees.lateFee : 0,
    paymentMethod,
    transactionId,
    processedAt: new Date(),
  };

  this.repayments.push(repayment);
  this.amountRepaid = (this.amountRepaid || 0) + amount;

  // Update next payment date
  this.updateNextPaymentDate();

  return this.save();
};

loanSchema.methods.updateNextPaymentDate = function () {
  if (!this.repaymentSchedule.frequency || this.status === "repaid") {
    this.repaymentSchedule.nextPaymentDate = null;
    return;
  }

  const lastPayment =
    this.repayments.length > 0
      ? this.repayments[this.repayments.length - 1].paymentDate
      : this.disbursedDate || this.fundedDate;

  if (!lastPayment) return;

  const nextDate = new Date(lastPayment);

  switch (this.repaymentSchedule.frequency) {
    case "weekly":
      nextDate.setDate(nextDate.getDate() + 7);
      break;
    case "bi-weekly":
      nextDate.setDate(nextDate.getDate() + 14);
      break;
    case "monthly":
      nextDate.setMonth(nextDate.getMonth() + 1);
      break;
    case "quarterly":
      nextDate.setMonth(nextDate.getMonth() + 3);
      break;
  }

  this.repaymentSchedule.nextPaymentDate = nextDate;
  this.repaymentSchedule.lastPaymentDate = lastPayment;
};

loanSchema.methods.calculateMonthlyPayment = function () {
  if (!this.amount || !this.interestRate || !this.term) return 0;

  const principal = this.amount;
  const monthlyRate = this.interestRate / 100 / 12;
  const termInMonths = this.termUnit === "years" ? this.term * 12 : this.term;

  if (monthlyRate === 0) {
    return principal / termInMonths;
  }

  const monthlyPayment =
    (principal * (monthlyRate * Math.pow(1 + monthlyRate, termInMonths))) /
    (Math.pow(1 + monthlyRate, termInMonths) - 1);

  return monthlyPayment;
};

loanSchema.methods.generateAmortizationSchedule = function () {
  const monthlyPayment = this.calculateMonthlyPayment();
  const monthlyRate = this.interestRate / 100 / 12;
  const termInMonths = this.termUnit === "years" ? this.term * 12 : this.term;

  const schedule = [];
  let remainingBalance = this.amount;
  let paymentDate = new Date(
    this.disbursedDate || this.fundedDate || new Date(),
  );

  for (let i = 1; i <= termInMonths; i++) {
    const interestPayment = remainingBalance * monthlyRate;
    const principalPayment = monthlyPayment - interestPayment;
    remainingBalance -= principalPayment;

    paymentDate.setMonth(paymentDate.getMonth() + 1);

    schedule.push({
      paymentNumber: i,
      paymentDate: new Date(paymentDate),
      paymentAmount: monthlyPayment,
      principalAmount: principalPayment,
      interestAmount: interestPayment,
      remainingBalance: Math.max(0, remainingBalance),
    });

    if (remainingBalance <= 0) break;
  }

  return schedule;
};

loanSchema.methods.addAuditEntry = function (
  action,
  performedBy,
  details,
  ipAddress,
  userAgent,
) {
  this.auditLog.push({
    action,
    performedBy,
    performedAt: new Date(),
    details,
    ipAddress,
    userAgent,
  });

  return this.save();
};

loanSchema.methods.addInternalNote = function (
  note,
  createdBy,
  isPrivate = true,
) {
  this.internalNotes.push({
    note,
    createdBy,
    isPrivate,
    createdAt: new Date(),
  });

  return this.save();
};

loanSchema.methods.toSafeObject = function () {
  const obj = this.toObject();

  // Remove sensitive internal information
  delete obj.internalNotes;
  delete obj.auditLog;
  delete obj.riskMetrics;

  // Remove sensitive payment details
  if (obj.paymentDetails) {
    delete obj.paymentDetails.processorTransactionId;
  }

  return obj;
};

// Static methods
loanSchema.statics.findByBorrower = function (borrowerId, status = null) {
  const query = { borrower: borrowerId };
  if (status) query.status = status;
  return this.find(query).populate(
    "borrower lender",
    "username email creditScore",
  );
};

loanSchema.statics.findByLender = function (lenderId, status = null) {
  const query = { lender: lenderId };
  if (status) query.status = status;
  return this.find(query).populate(
    "borrower lender",
    "username email creditScore",
  );
};

loanSchema.statics.findMarketplaceLoans = function (filters = {}) {
  const query = { status: "marketplace", ...filters };
  return this.find(query)
    .populate("borrower", "username creditScore kycStatus")
    .sort({ applicationDate: -1 });
};

loanSchema.statics.findOverdueLoans = function () {
  const today = new Date();
  return this.find({
    status: "active",
    "repaymentSchedule.nextPaymentDate": { $lt: today },
  }).populate("borrower lender", "username email phoneNumber");
};

loanSchema.statics.findMaturingLoans = function (days = 30) {
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + days);

  return this.find({
    status: "active",
    maturityDate: { $lte: futureDate },
  }).populate("borrower lender", "username email phoneNumber");
};

loanSchema.statics.getPortfolioStats = function (userId, role = "borrower") {
  const matchField = role === "borrower" ? "borrower" : "lender";

  return this.aggregate([
    { $match: { [matchField]: new mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        totalAmount: { $sum: "$amount" },
        totalRepaid: { $sum: "$amountRepaid" },
      },
    },
  ]);
};

module.exports = mongoose.model("Loan", loanSchema);
