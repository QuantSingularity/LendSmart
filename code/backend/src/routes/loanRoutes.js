const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/auth");
const loanController = require("../controllers/loanController");

// Protected routes that must come BEFORE /:id to prevent route conflicts
router.get(
  "/my-loans",
  protect,
  loanController.getUserLoans.bind(loanController),
);
router.post(
  "/apply",
  protect,
  loanController.applyForLoan.bind(loanController),
);

// Public routes
router.get("/", loanController.getMarketplaceLoans.bind(loanController));
router.get("/:id", loanController.getLoanDetails.bind(loanController));

// Protected routes with :id parameter
router.post("/:id/fund", protect, loanController.fundLoan.bind(loanController));
router.post(
  "/:id/repay",
  protect,
  loanController.makeRepayment.bind(loanController),
);

module.exports = router;
