const User = require("../models/User");

/**
 * @desc    Get all users
 * @route   GET /api/users
 * @access  Private/Admin
 */
exports.getUsers = async (req, res, next) => {
  try {
    const users = await User.find().select(
      "-password -mfaSecret -mfaBackupCodes -refreshTokens",
    );

    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single user
 * @route   GET /api/users/:id
 * @access  Private/Admin
 */
exports.getUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select(
      "-password -mfaSecret -mfaBackupCodes -refreshTokens",
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create user
 * @route   POST /api/users
 * @access  Private/Admin
 */
exports.createUser = async (req, res, next) => {
  try {
    const {
      username,
      firstName,
      lastName,
      email,
      password,
      phoneNumber,
      walletAddress,
      role,
      employmentStatus,
      dateOfBirth,
    } = req.body;

    if (
      !username ||
      !firstName ||
      !lastName ||
      !email ||
      !password ||
      !phoneNumber ||
      !employmentStatus ||
      !dateOfBirth
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Please provide username, firstName, lastName, email, password, phoneNumber, employmentStatus, and dateOfBirth",
      });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email or username already in use",
      });
    }

    if (walletAddress) {
      const walletUser = await User.findOne({ walletAddress });
      if (walletUser) {
        return res.status(400).json({
          success: false,
          message: "Wallet address already in use",
        });
      }
    }

    const user = await User.create({
      username,
      firstName,
      lastName,
      email,
      password,
      phoneNumber,
      walletAddress,
      role: role || "user",
      employmentStatus,
      dateOfBirth,
    });

    const safeUser = user.toSafeObject();

    res.status(201).json({
      success: true,
      data: safeUser,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update user
 * @route   PUT /api/users/:id
 * @access  Private/Admin
 */
exports.updateUser = async (req, res, next) => {
  try {
    const allowedFields = [
      "firstName",
      "lastName",
      "email",
      "role",
      "phoneNumber",
      "employmentStatus",
      "accountStatus",
      "kycStatus",
      "creditScore",
    ];

    const fieldsToUpdate = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        fieldsToUpdate[field] = req.body[field];
      }
    });

    if (req.body.walletAddress) {
      const walletUser = await User.findOne({
        walletAddress: req.body.walletAddress,
        _id: { $ne: req.params.id },
      });

      if (walletUser) {
        return res.status(400).json({
          success: false,
          message: "Wallet address already in use",
        });
      }
      fieldsToUpdate.walletAddress = req.body.walletAddress;
    }

    const user = await User.findByIdAndUpdate(req.params.id, fieldsToUpdate, {
      new: true,
      runValidators: true,
    }).select("-password -mfaSecret -mfaBackupCodes -refreshTokens");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete user
 * @route   DELETE /api/users/:id
 * @access  Private/Admin
 */
exports.deleteUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    await user.deleteOne();

    res.status(200).json({
      success: true,
      data: {},
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get users by role
 * @route   GET /api/users/role/:role
 * @access  Private/Admin
 */
exports.getUsersByRole = async (req, res, next) => {
  try {
    const { role } = req.params;
    const validRoles = ["user", "admin", "risk-assessor", "support"];

    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Valid roles: ${validRoles.join(", ")}`,
      });
    }

    const users = await User.find({ role }).select(
      "-password -mfaSecret -mfaBackupCodes -refreshTokens",
    );

    res.status(200).json({
      success: true,
      count: users.length,
      data: users,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get user by wallet address
 * @route   GET /api/users/wallet/:address
 * @access  Private/Admin
 */
exports.getUserByWalletAddress = async (req, res, next) => {
  try {
    const { address } = req.params;
    const user = await User.findOne({ walletAddress: address }).select(
      "-password -mfaSecret -mfaBackupCodes -refreshTokens",
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      data: user,
    });
  } catch (error) {
    next(error);
  }
};
