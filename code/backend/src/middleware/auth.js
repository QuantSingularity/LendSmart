const jwt = require("jsonwebtoken");
const User = require("../models/User");

/**
 * Protect routes - verify JWT token
 */
exports.protect = async (req, res, next) => {
  let token;

  // Check for token in Authorization header
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    token = req.headers.authorization.split(" ")[1];
  }
  // Check for token in cookies
  else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Not authorized to access this route",
      errorCode: "NO_TOKEN",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select(
      "-password -mfaSecret -mfaBackupCodes",
    );

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User no longer exists",
        errorCode: "USER_NOT_FOUND",
      });
    }

    // Check if account is active
    if (user.accountStatus === "suspended" || user.accountStatus === "closed") {
      return res.status(403).json({
        success: false,
        message: "Account has been suspended or closed",
        errorCode: "ACCOUNT_INACTIVE",
      });
    }

    // Check if account is locked
    if (user.isAccountLocked) {
      return res.status(403).json({
        success: false,
        message: "Account is temporarily locked due to failed login attempts",
        errorCode: "ACCOUNT_LOCKED",
      });
    }

    // Check if password was changed after token was issued
    if (user.passwordChangedAt) {
      const passwordChangedTimestamp = parseInt(
        user.passwordChangedAt.getTime() / 1000,
        10,
      );
      if (decoded.iat < passwordChangedTimestamp) {
        return res.status(401).json({
          success: false,
          message: "Password was recently changed. Please log in again.",
          errorCode: "PASSWORD_CHANGED",
        });
      }
    }

    req.user = user;
    next();
  } catch (err) {
    const message =
      err.name === "TokenExpiredError"
        ? "Token has expired. Please log in again."
        : "Not authorized to access this route";

    return res.status(401).json({
      success: false,
      message,
      errorCode:
        err.name === "TokenExpiredError" ? "TOKEN_EXPIRED" : "INVALID_TOKEN",
    });
  }
};

/**
 * Grant access to specific roles
 */
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role || !roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role '${req.user?.role}' is not authorized to access this route`,
        errorCode: "FORBIDDEN",
      });
    }
    next();
  };
};
