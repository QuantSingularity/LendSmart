const User = require("../models/User");
const Loan = require("../models/Loan");
const { asyncHandler } = require("../middleware/monitoring/errorHandler");
const { logger } = require("../utils/logger");
const { getAuditLogger } = require("../compliance/auditLogger");

const auditLogger = getAuditLogger();

/**
 * @desc    Get all users
 * @route   GET /api/admin/users
 * @access  Private/Admin
 */
exports.getAllUsers = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    sort = "-createdAt",
    status,
    role,
    search,
  } = req.query;

  // Build query
  const query = {};

  if (status) {
    query.accountStatus = status;
  }

  if (role) {
    query.role = role;
  }

  if (search) {
    query.$or = [
      { email: { $regex: search, $options: "i" } },
      { username: { $regex: search, $options: "i" } },
      { firstName: { $regex: search, $options: "i" } },
      { lastName: { $regex: search, $options: "i" } },
    ];
  }

  // Execute query with pagination
  const users = await User.find(query)
    .select("-password")
    .sort(sort)
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .lean();

  // Get total count
  const count = await User.countDocuments(query);

  // Log admin action
  await auditLogger.logAdminAction({
    adminId: req.user._id,
    action: "view_all_users",
    ip: req.ip,
    userAgent: req.get("User-Agent"),
    timestamp: new Date().toISOString(),
  });

  res.status(200).json({
    success: true,
    count: users.length,
    total: count,
    totalPages: Math.ceil(count / limit),
    currentPage: page,
    data: users,
  });
});

/**
 * @desc    Get user by ID
 * @route   GET /api/admin/users/:id
 * @access  Private/Admin
 */
exports.getUserById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select("-password");

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  // Log admin action
  await auditLogger.logAdminAction({
    adminId: req.user._id,
    action: "view_user_details",
    targetUserId: user._id,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
    timestamp: new Date().toISOString(),
  });

  res.status(200).json({
    success: true,
    data: user,
  });
});

/**
 * @desc    Update user status
 * @route   PUT /api/admin/users/:id/status
 * @access  Private/Admin
 */
exports.updateUserStatus = asyncHandler(async (req, res) => {
  const { status, reason } = req.body;

  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  const oldStatus = user.status;
  user.status = status;

  if (reason) {
    user.statusReason = reason;
  }

  await user.save();

  // Log admin action
  await auditLogger.logAdminAction({
    adminId: req.user._id,
    action: "update_user_status",
    targetUserId: user._id,
    oldValue: oldStatus,
    newValue: status,
    reason,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
    timestamp: new Date().toISOString(),
  });

  res.status(200).json({
    success: true,
    message: "User status updated successfully",
    data: user,
  });
});

/**
 * @desc    Delete user
 * @route   DELETE /api/admin/users/:id
 * @access  Private/Admin
 */
exports.deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found",
    });
  }

  await user.deleteOne();

  // Log admin action
  await auditLogger.logAdminAction({
    adminId: req.user._id,
    action: "delete_user",
    targetUserId: req.params.id,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
    timestamp: new Date().toISOString(),
  });

  res.status(200).json({
    success: true,
    message: "User deleted successfully",
  });
});

/**
 * @desc    Get all loans
 * @route   GET /api/admin/loans
 * @access  Private/Admin
 */
exports.getAllLoans = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    sort = "-createdAt",
    status,
    minAmount,
    maxAmount,
  } = req.query;

  // Build query
  const query = {};

  if (status) {
    query.accountStatus = status;
  }

  if (minAmount) {
    query.amount = { ...query.amount, $gte: parseFloat(minAmount) };
  }

  if (maxAmount) {
    query.amount = { ...query.amount, $lte: parseFloat(maxAmount) };
  }

  // Execute query with pagination
  const loans = await Loan.find(query)
    .populate("borrower", "username email")
    .sort(sort)
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .lean();

  // Get total count
  const count = await Loan.countDocuments(query);

  // Log admin action
  await auditLogger.logAdminAction({
    adminId: req.user._id,
    action: "view_all_loans",
    ip: req.ip,
    userAgent: req.get("User-Agent"),
    timestamp: new Date().toISOString(),
  });

  res.status(200).json({
    success: true,
    count: loans.length,
    total: count,
    totalPages: Math.ceil(count / limit),
    currentPage: page,
    data: loans,
  });
});

/**
 * @desc    Get loan by ID
 * @route   GET /api/admin/loans/:id
 * @access  Private/Admin
 */
exports.getLoanById = asyncHandler(async (req, res) => {
  const loan = await Loan.findById(req.params.id)
    .populate("borrower", "username email firstName lastName")
    .populate("lender", "username email firstName lastName");

  if (!loan) {
    return res.status(404).json({
      success: false,
      message: "Loan not found",
    });
  }

  // Log admin action
  await auditLogger.logAdminAction({
    adminId: req.user._id,
    action: "view_loan_details",
    loanId: loan._id,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
    timestamp: new Date().toISOString(),
  });

  res.status(200).json({
    success: true,
    data: loan,
  });
});

/**
 * @desc    Update loan status
 * @route   PUT /api/admin/loans/:id/status
 * @access  Private/Admin
 */
exports.updateLoanStatus = asyncHandler(async (req, res) => {
  const { status, reason } = req.body;

  const loan = await Loan.findById(req.params.id);

  if (!loan) {
    return res.status(404).json({
      success: false,
      message: "Loan not found",
    });
  }

  const oldStatus = loan.status;
  loan.status = status;

  if (reason) {
    // internalNotes is the correct schema field
    loan.internalNotes.push({
      note: reason,
      createdBy: req.user._id,
      createdAt: new Date(),
      isPrivate: true,
    });
  }

  await loan.save();

  // Log admin action
  await auditLogger.logAdminAction({
    adminId: req.user._id,
    action: "update_loan_status",
    loanId: loan._id,
    oldValue: oldStatus,
    newValue: status,
    reason,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
    timestamp: new Date().toISOString(),
  });

  res.status(200).json({
    success: true,
    message: "Loan status updated successfully",
    data: loan,
  });
});

/**
 * @desc    Get system analytics
 * @route   GET /api/admin/analytics
 * @access  Private/Admin
 */
exports.getSystemAnalytics = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  // Build date filter
  const dateFilter = {};
  if (startDate) {
    dateFilter.$gte = new Date(startDate);
  }
  if (endDate) {
    dateFilter.$lte = new Date(endDate);
  }

  // Get user statistics
  const totalUsers = await User.countDocuments();
  const activeUsers = await User.countDocuments({ accountStatus: "active" });
  const newUsersQuery =
    Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};
  const newUsers = await User.countDocuments(newUsersQuery);

  // Get loan statistics
  const totalLoans = await Loan.countDocuments();
  const activeLoans = await Loan.countDocuments({ accountStatus: "active" });
  const completedLoans = await Loan.countDocuments({ status: "repaid" });

  // Calculate total loan amount
  const loanAggregation = await Loan.aggregate([
    {
      $group: {
        _id: null,
        totalAmount: { $sum: "$amount" },
        averageAmount: { $avg: "$amount" },
      },
    },
  ]);

  const analytics = {
    users: {
      total: totalUsers,
      active: activeUsers,
      new: newUsers,
    },
    loans: {
      total: totalLoans,
      active: activeLoans,
      completed: completedLoans,
      totalAmount: loanAggregation[0]?.totalAmount || 0,
      averageAmount: loanAggregation[0]?.averageAmount || 0,
    },
    timestamp: new Date().toISOString(),
  };

  // Log admin action
  await auditLogger.logAdminAction({
    adminId: req.user._id,
    action: "view_analytics",
    ip: req.ip,
    userAgent: req.get("User-Agent"),
    timestamp: new Date().toISOString(),
  });

  res.status(200).json({
    success: true,
    data: analytics,
  });
});

/**
 * @desc    Get system metrics
 * @route   GET /api/admin/metrics
 * @access  Private/Admin
 */
exports.getSystemMetrics = asyncHandler(async (req, res) => {
  const metrics = {
    system: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      nodeVersion: process.version,
    },
    timestamp: new Date().toISOString(),
  };

  res.status(200).json({
    success: true,
    data: metrics,
  });
});

/**
 * @desc    Export audit logs
 * @route   POST /api/admin/audit-logs/export
 * @access  Private/Admin
 */
exports.exportAuditLogs = asyncHandler(async (req, res) => {
  const { startDate, endDate, format = "json" } = req.body;

  // Export audit logs
  const exportResult = await auditLogger.exportAuditLogs({
    startDate,
    endDate,
    format,
    includeEncrypted: false,
  });

  // Log admin action
  await auditLogger.logAdminAction({
    adminId: req.user._id,
    action: "export_audit_logs",
    startDate,
    endDate,
    format,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
    timestamp: new Date().toISOString(),
  });

  res.status(200).json({
    success: true,
    message: "Audit logs exported successfully",
    data: exportResult,
  });
});
