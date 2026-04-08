const Loan = require("../models/Loan");
const User = require("../models/User");
const { getAuditLogger } = require("../compliance/auditLogger");
const { getEncryptionService } = require("../config/security/encryption");
const { logger } = require("../utils/logger");
const creditScoringService = require("../services/creditScoringService");
const blockchainService = require("../services/blockchainService");
const notificationService = require("../services/notificationService");

/**
 * Loan Controller
 * Implements enterprise-grade loan management with compliance and security
 */
class LoanController {
  constructor() {
    this.auditLogger = getAuditLogger();
    this.encryptionService = getEncryptionService();
  }

  /**
   * Apply for a new loan
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async applyForLoan(req, res) {
    try {
      const userId = req.user.id;
      const {
        amount,
        interestRate,
        term,
        termUnit,
        purpose,
        collateral,
        income,
        employmentStatus,
      } = req.body;

      // Get user for credit assessment
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found",
        });
      }

      // Check if user has verified KYC
      if (user.kycStatus !== "verified") {
        return res.status(400).json({
          success: false,
          message: "KYC verification required before applying for loans",
          requiredAction: "complete_kyc",
        });
      }

      // Check for existing pending applications
      const existingApplication = await Loan.findOne({
        borrower: userId,
        status: { $in: ["pending_approval", "marketplace"] },
      });

      if (existingApplication) {
        return res.status(400).json({
          success: false,
          message: "You already have a pending loan application",
          existingApplicationId: existingApplication._id,
        });
      }

      // Perform credit scoring
      const creditAssessment =
        await creditScoringService.assessCreditworthiness({
          userId,
          requestedAmount: amount,
          income,
          employmentStatus,
          existingLoans: await this.getUserActiveLoans(userId),
        });

      if (!creditAssessment.approved) {
        // Audit log for rejected application
        await this.auditLogger.logLoanEvent({
          action: "loan_application_rejected",
          userId,
          amount,
          rejectionReason: creditAssessment.reason,
          creditScore: creditAssessment.creditScore,
          ip: req.ip,
          timestamp: new Date().toISOString(),
        });

        return res.status(400).json({
          success: false,
          message: "Loan application does not meet credit requirements",
          creditAssessment: {
            creditScore: creditAssessment.creditScore,
            reason: creditAssessment.reason,
            recommendations: creditAssessment.recommendations,
          },
        });
      }

      // Create loan application
      const loanData = {
        borrower: userId,
        amount,
        interestRate: creditAssessment.recommendedRate || interestRate,
        term,
        termUnit,
        purpose,
        collateral,
        status: "pending_approval",
        applicationDate: new Date(),
        creditAssessment: {
          score: creditAssessment.creditScore,
          riskLevel: creditAssessment.riskLevel,
          assessmentDate: new Date(),
        },
      };

      const loan = new Loan(loanData);
      await loan.save();

      // Update user's credit score
      await user.updateCreditScore();

      // Audit log
      await this.auditLogger.logLoanEvent({
        action: "loan_application_submitted",
        loanId: loan._id,
        userId,
        amount,
        interestRate: loan.interestRate,
        term,
        creditScore: creditAssessment.creditScore,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });

      // Send notification to user
      await notificationService.sendLoanApplicationConfirmation(user, loan);

      // Send notification to admin for review
      await notificationService.notifyAdminNewLoanApplication(loan);

      res.status(201).json({
        success: true,
        message: "Loan application submitted successfully",
        data: {
          loan: await this.sanitizeLoanData(loan),
          creditAssessment: {
            creditScore: creditAssessment.creditScore,
            riskLevel: creditAssessment.riskLevel,
            recommendedRate: creditAssessment.recommendedRate,
          },
          nextSteps: {
            adminReview: true,
            estimatedReviewTime: "24-48 hours",
          },
        },
      });
    } catch (error) {
      logger.error("Loan application error", {
        error: error.message,
        userId: req.user?.id,
        body: req.body,
        ip: req.ip,
      });

      res.status(500).json({
        success: false,
        message: "Failed to submit loan application",
        errorCode: "LOAN_APPLICATION_ERROR",
      });
    }
  }

  /**
   * Get loans for marketplace
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getMarketplaceLoans(req, res) {
    try {
      const {
        page = 1,
        limit = 20,
        minAmount,
        maxAmount,
        maxInterestRate,
        termUnit,
        riskLevel,
        sortBy = "applicationDate",
        sortOrder = "desc",
      } = req.query;

      // Build filter query
      const filter = { status: "marketplace" };

      if (minAmount)
        filter.amount = { ...filter.amount, $gte: parseFloat(minAmount) };
      if (maxAmount)
        filter.amount = { ...filter.amount, $lte: parseFloat(maxAmount) };
      if (maxInterestRate)
        filter.interestRate = { $lte: parseFloat(maxInterestRate) };
      if (termUnit) filter.termUnit = termUnit;
      if (riskLevel) filter["creditAssessment.riskLevel"] = riskLevel;

      // Build sort object
      const sort = {};
      sort[sortBy] = sortOrder === "desc" ? -1 : 1;

      // Execute query with pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const loans = await Loan.find(filter)
        .populate("borrower", "username creditScore kycStatus")
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit));

      const totalLoans = await Loan.countDocuments(filter);
      const totalPages = Math.ceil(totalLoans / parseInt(limit));

      // Sanitize loan data for marketplace
      const sanitizedLoans = await Promise.all(
        loans.map((loan) => this.sanitizeLoanDataForMarketplace(loan)),
      );

      // Audit log
      await this.auditLogger.logDataAccess({
        action: "marketplace_loans_accessed",
        userId: req.user?.id,
        filters: filter,
        resultCount: loans.length,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });

      res.json({
        success: true,
        data: {
          loans: sanitizedLoans,
          pagination: {
            currentPage: parseInt(page),
            totalPages,
            totalLoans,
            hasNextPage: parseInt(page) < totalPages,
            hasPrevPage: parseInt(page) > 1,
          },
          filters: {
            applied: filter,
            available: {
              riskLevels: ["low", "medium", "high"],
              termUnits: ["days", "weeks", "months", "years"],
              sortOptions: [
                "applicationDate",
                "amount",
                "interestRate",
                "term",
              ],
            },
          },
        },
      });
    } catch (error) {
      logger.error("Get marketplace loans error", {
        error: error.message,
        query: req.query,
        ip: req.ip,
      });

      res.status(500).json({
        success: false,
        message: "Failed to retrieve marketplace loans",
      });
    }
  }

  /**
   * Fund a loan (for lenders)
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async fundLoan(req, res) {
    try {
      const lenderId = req.user.id;
      const loanId = req.params.id || req.params.loanId;
      const { fundingAmount, paymentMethod, walletAddress } = req.body;

      // Get loan
      const loan = await Loan.findById(loanId).populate("borrower");
      if (!loan) {
        return res.status(404).json({
          success: false,
          message: "Loan not found",
        });
      }

      // Check loan status
      if (loan.status !== "marketplace") {
        return res.status(400).json({
          success: false,
          message: "Loan is not available for funding",
          currentStatus: loan.status,
        });
      }

      // Check if user is trying to fund their own loan
      if (loan.borrower._id.toString() === lenderId) {
        return res.status(400).json({
          success: false,
          message: "Cannot fund your own loan",
        });
      }

      // Validate funding amount
      if (fundingAmount !== loan.amount) {
        return res.status(400).json({
          success: false,
          message: "Funding amount must match loan amount",
          requiredAmount: loan.amount,
          providedAmount: fundingAmount,
        });
      }

      // Get lender information
      const lender = await User.findById(lenderId);
      if (!lender) {
        return res.status(404).json({
          success: false,
          message: "Lender not found",
        });
      }

      // Check lender KYC status
      if (lender.kycStatus !== "verified") {
        return res.status(400).json({
          success: false,
          message: "KYC verification required before funding loans",
        });
      }

      // Process payment (integration with payment processor)
      const paymentResult = await this.processLoanFunding({
        lenderId,
        borrowerId: loan.borrower._id,
        amount: fundingAmount,
        paymentMethod,
        walletAddress,
        loanId,
      });

      if (!paymentResult.success) {
        return res.status(400).json({
          success: false,
          message: "Payment processing failed",
          error: paymentResult.error,
        });
      }

      // Update loan with funding information
      loan.lender = lenderId;
      loan.status = "funded";
      loan.fundedDate = new Date();
      loan.amountFunded = fundingAmount;
      loan.paymentDetails = {
        transactionId: paymentResult.transactionId,
        paymentMethod,
        processedAt: new Date(),
      };

      // Calculate maturity date
      await loan.save();

      // Create smart contract on blockchain
      try {
        const contractResult = await blockchainService.createLoanContract({
          loanId: loan._id,
          borrower: loan.borrower.walletAddress,
          lender: lender.walletAddress,
          amount: loan.amount,
          interestRate: loan.interestRate,
          term: loan.term,
          maturityDate: loan.maturityDate,
        });

        loan.blockchainContract = {
          contractAddress: contractResult.contractAddress,
          transactionHash: contractResult.transactionHash,
          createdAt: new Date(),
        };
        await loan.save();
      } catch (blockchainError) {
        logger.error("Blockchain contract creation failed", {
          error: blockchainError.message,
          loanId: loan._id,
        });
        // Continue without blockchain - can be retried later
      }

      // Audit log
      await this.auditLogger.logLoanEvent({
        action: "loan_funded",
        loanId: loan._id,
        lenderId,
        borrowerId: loan.borrower._id,
        amount: fundingAmount,
        transactionId: paymentResult.transactionId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });

      // Send notifications
      await notificationService.sendLoanFundedNotification(
        loan.borrower,
        loan,
        lender,
      );
      await notificationService.sendFundingConfirmation(lender, loan);

      res.json({
        success: true,
        message: "Loan funded successfully",
        data: {
          loan: await this.sanitizeLoanData(loan),
          payment: {
            transactionId: paymentResult.transactionId,
            amount: fundingAmount,
            processedAt: loan.paymentDetails.processedAt,
          },
          blockchain: loan.blockchainContract
            ? {
                contractAddress: loan.blockchainContract.contractAddress,
                transactionHash: loan.blockchainContract.transactionHash,
              }
            : null,
        },
      });
    } catch (error) {
      logger.error("Loan funding error", {
        error: error.message,
        loanId: loanId,
        lenderId: req.user?.id,
        ip: req.ip,
      });

      res.status(500).json({
        success: false,
        message: "Failed to fund loan",
        errorCode: "LOAN_FUNDING_ERROR",
      });
    }
  }

  /**
   * Make loan repayment
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async makeRepayment(req, res) {
    try {
      const userId = req.user.id;
      const loanId = req.params.id || req.params.loanId;
      const { amount, paymentMethod, walletAddress } = req.body;

      // Get loan
      const loan = await Loan.findById(loanId).populate("borrower lender");
      if (!loan) {
        return res.status(404).json({
          success: false,
          message: "Loan not found",
        });
      }

      // Check if user is the borrower
      if (loan.borrower._id.toString() !== userId) {
        return res.status(403).json({
          success: false,
          message: "Only the borrower can make repayments",
        });
      }

      // Check loan status
      if (!["active", "funded"].includes(loan.status)) {
        return res.status(400).json({
          success: false,
          message: "Loan is not in a state that accepts repayments",
          currentStatus: loan.status,
        });
      }

      // Calculate repayment details
      const repaymentDetails = await this.calculateRepaymentDetails(
        loan,
        amount,
      );

      // Process payment
      const paymentResult = await this.processLoanRepayment({
        borrowerId: userId,
        lenderId: loan.lender?._id,
        amount,
        paymentMethod,
        walletAddress,
        loanId,
      });

      if (!paymentResult.success) {
        return res.status(400).json({
          success: false,
          message: "Payment processing failed",
          error: paymentResult.error,
        });
      }

      // Update loan with repayment
      if (!loan.repayments) {
        loan.repayments = [];
      }

      loan.repayments.push({
        amount,
        paymentDate: new Date(),
        transactionId: paymentResult.transactionId,
        paymentMethod,
        principalAmount: repaymentDetails.principalAmount,
        interestAmount: repaymentDetails.interestAmount,
      });

      loan.amountRepaid = (loan.amountRepaid || 0) + amount;

      // Check if loan is fully repaid
      if (loan.amountRepaid >= repaymentDetails.totalAmountDue) {
        loan.status = "repaid";
        loan.repaidDate = new Date();
      } else {
        loan.status = "active";
      }

      await loan.save();

      // Update blockchain contract
      try {
        if (loan.blockchainContract) {
          await blockchainService.recordRepayment({
            contractAddress: loan.blockchainContract.contractAddress,
            amount,
            transactionHash: paymentResult.transactionHash,
          });
        }
      } catch (blockchainError) {
        logger.error("Blockchain repayment recording failed", {
          error: blockchainError.message,
          loanId: loan._id,
        });
      }

      // Audit log
      await this.auditLogger.logFinancialTransaction({
        action: "loan_repayment",
        loanId: loan._id,
        borrowerId: userId,
        lenderId: loan.lender._id,
        amount,
        transactionId: paymentResult.transactionId,
        remainingBalance: repaymentDetails.totalAmountDue - loan.amountRepaid,
        isFullRepayment: loan.status === "repaid",
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });

      // Send notifications
      await notificationService.sendRepaymentConfirmation(
        loan.borrower,
        loan,
        amount,
      );
      await notificationService.sendRepaymentReceived(
        loan.lender,
        loan,
        amount,
      );

      res.json({
        success: true,
        message:
          loan.status === "repaid"
            ? "Loan fully repaid"
            : "Repayment processed successfully",
        data: {
          loan: await this.sanitizeLoanData(loan),
          repayment: {
            amount,
            transactionId: paymentResult.transactionId,
            principalAmount: repaymentDetails.principalAmount,
            interestAmount: repaymentDetails.interestAmount,
            remainingBalance:
              repaymentDetails.totalAmountDue - loan.amountRepaid,
          },
          loanStatus: loan.status,
        },
      });
    } catch (error) {
      logger.error("Loan repayment error", {
        error: error.message,
        loanId: loanId,
        userId: req.user?.id,
        ip: req.ip,
      });

      res.status(500).json({
        success: false,
        message: "Failed to process repayment",
        errorCode: "REPAYMENT_ERROR",
      });
    }
  }

  /**
   * Get user's loans
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getUserLoans(req, res) {
    try {
      const userId = req.user.id;
      const { type = "all", status, page = 1, limit = 20 } = req.query;

      // Build filter
      let filter = {};

      if (type === "borrowed") {
        filter.borrower = userId;
      } else if (type === "lent") {
        filter.lender = userId;
      } else {
        filter.$or = [{ borrower: userId }, { lender: userId }];
      }

      if (status) {
        filter.status = status;
      }

      // Execute query with pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);
      const loans = await Loan.find(filter)
        .populate("borrower lender", "username creditScore")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const totalLoans = await Loan.countDocuments(filter);

      // Sanitize loan data
      const sanitizedLoans = await Promise.all(
        loans.map((loan) => this.sanitizeLoanData(loan)),
      );

      // Calculate summary statistics
      const summary = await this.calculateUserLoanSummary(userId, type);

      // Audit log
      await this.auditLogger.logDataAccess({
        action: "user_loans_accessed",
        userId,
        loanType: type,
        resultCount: loans.length,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });

      res.json({
        success: true,
        data: {
          loans: sanitizedLoans,
          summary,
          pagination: {
            currentPage: parseInt(page),
            totalPages: Math.ceil(totalLoans / parseInt(limit)),
            totalLoans,
            hasNextPage:
              parseInt(page) < Math.ceil(totalLoans / parseInt(limit)),
            hasPrevPage: parseInt(page) > 1,
          },
        },
      });
    } catch (error) {
      logger.error("Get user loans error", {
        error: error.message,
        userId: req.user?.id,
        ip: req.ip,
      });

      res.status(500).json({
        success: false,
        message: "Failed to retrieve loans",
      });
    }
  }

  /**
   * Get loan details
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getLoanDetails(req, res) {
    try {
      const userId = req.user?.id;
      const loanId = req.params.id || req.params.loanId;

      const loan = await Loan.findById(loanId).populate(
        "borrower lender",
        "username creditScore kycStatus",
      );

      if (!loan) {
        return res.status(404).json({
          success: false,
          message: "Loan not found",
        });
      }

      // Public marketplace loans are visible to all
      // Private loans require ownership or admin access
      if (loan.status !== "marketplace") {
        const hasAccess =
          userId &&
          (loan.borrower._id.toString() === userId ||
            loan.lender?._id.toString() === userId ||
            req.user?.role === "admin");

        if (!hasAccess) {
          return res.status(403).json({
            success: false,
            message: "Access denied",
          });
        }
      }

      // Get detailed loan information
      const loanDetails = await this.getDetailedLoanInfo(loan, userId);

      // Audit log
      await this.auditLogger.logDataAccess({
        action: "loan_details_accessed",
        loanId,
        userId,
        ip: req.ip,
        timestamp: new Date().toISOString(),
      });

      res.json({
        success: true,
        data: loanDetails,
      });
    } catch (error) {
      logger.error("Get loan details error", {
        error: error.message,
        loanId: loanId,
        userId: req.user?.id,
        ip: req.ip,
      });

      res.status(500).json({
        success: false,
        message: "Failed to retrieve loan details",
      });
    }
  }

  // Helper methods

  /**
   * Get user's active loans
   * @param {string} userId - User ID
   * @returns {Array} Active loans
   */
  async getUserActiveLoans(userId) {
    return await Loan.find({
      borrower: userId,
      status: { $in: ["active", "funded", "pending_approval"] },
    });
  }

  /**
   * Sanitize loan data for public response
   * @param {Object} loan - Loan object
   * @returns {Object} Sanitized loan data
   */
  async sanitizeLoanData(loan) {
    const sanitized =
      loan && typeof loan.toObject === "function"
        ? loan.toObject()
        : { ...loan };

    // Remove sensitive information
    delete sanitized.internalNotes;
    delete sanitized.auditLog;
    delete sanitized.paymentDetails;
    delete sanitized.creditAssessment;

    return sanitized;
  }

  /**
   * Sanitize loan data for marketplace display
   * @param {Object} loan - Loan object
   * @returns {Object} Sanitized loan data for marketplace
   */
  async sanitizeLoanDataForMarketplace(loan) {
    const sanitized = await this.sanitizeLoanData(loan);

    // Remove borrower personal information for marketplace
    if (sanitized.borrower) {
      sanitized.borrower = {
        creditScore: sanitized.borrower.creditScore,
        kycStatus: sanitized.borrower.kycStatus,
      };
    }

    return sanitized;
  }

  /**
   * Process loan funding payment
   * @param {Object} fundingData - Funding data
   * @returns {Object} Payment result
   */
  async processLoanFunding(fundingData) {
    // Implementation would integrate with payment processors
    // For now, return a mock successful result
    return {
      success: true,
      transactionId: `txn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      processedAt: new Date(),
    };
  }

  /**
   * Process loan repayment
   * @param {Object} repaymentData - Repayment data
   * @returns {Object} Payment result
   */
  async processLoanRepayment(repaymentData) {
    // Implementation would integrate with payment processors
    return {
      success: true,
      transactionId: `rep_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
      processedAt: new Date(),
    };
  }

  /**
   * Calculate repayment details
   * @param {Object} loan - Loan object
   * @param {number} paymentAmount - Payment amount
   * @returns {Object} Repayment details
   */
  async calculateRepaymentDetails(loan, paymentAmount) {
    // Simple interest calculation - in production, use more sophisticated models
    const principal = loan.amount;
    const rate = loan.interestRate / 100;
    const timeInYears = loan.term / (loan.termUnit === "months" ? 12 : 365);

    const totalInterest = principal * rate * timeInYears;
    const totalAmountDue = principal + totalInterest;

    const remainingBalance = totalAmountDue - (loan.amountRepaid || 0);
    const interestPortion = Math.min(
      paymentAmount,
      totalInterest * (remainingBalance / totalAmountDue),
    );
    const principalPortion = paymentAmount - interestPortion;

    return {
      totalAmountDue,
      remainingBalance,
      principalAmount: principalPortion,
      interestAmount: interestPortion,
    };
  }

  /**
   * Calculate user loan summary
   * @param {string} userId - User ID
   * @param {string} type - Loan type (borrowed/lent/all)
   * @returns {Object} Loan summary
   */
  async calculateUserLoanSummary(userId, type) {
    // Implementation would calculate various statistics
    return {
      totalLoans: 0,
      activeLoans: 0,
      totalBorrowed: 0,
      totalLent: 0,
      totalRepaid: 0,
      averageInterestRate: 0,
      creditScore: 0,
    };
  }

  /**
   * Get detailed loan information
   * @param {Object} loan - Loan object
   * @param {string} userId - User ID
   * @returns {Object} Detailed loan info
   */
  async getDetailedLoanInfo(loan, userId) {
    const details = await this.sanitizeLoanData(loan);

    // Add additional details based on user role
    if (
      loan.borrower._id.toString() === userId ||
      loan.lender?._id.toString() === userId
    ) {
      // Add repayment schedule, payment history, etc.
      details.repaymentSchedule = await this.generateRepaymentSchedule(loan);
      details.paymentHistory = loan.repayments || [];
    }

    return details;
  }

  /**
   * Generate repayment schedule
   * @param {Object} loan - Loan object
   * @returns {Array} Repayment schedule
   */
  async generateRepaymentSchedule(loan) {
    // Implementation would generate detailed repayment schedule
    return [];
  }
}

module.exports = new LoanController();
