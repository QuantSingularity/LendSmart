// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title LendSmartLoan
 * @dev Enhanced smart contract for managing peer-to-peer lending with improved loan disbursement logic.
 * This contract allows borrowers to request loans, lenders to fund them, and manages the disbursement,
 * repayment, and default processes with additional features for risk management.
 */
contract LendSmartLoan is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    struct Loan {
        uint256 id;
        address borrower;
        address lender;
        address token; // Address of the ERC20 token used for the loan
        uint256 principal;
        uint256 interestRate; // Annual interest rate, e.g., 500 for 5.00%
        uint256 duration; // Loan duration in seconds
        uint256 requestedTime;
        uint256 fundedTime;
        uint256 disbursedTime; // New field to track when funds were disbursed
        uint256 repaymentAmount; // Principal + Interest
        uint256 amountRepaid;
        uint256 riskScore; // Risk score from AI model (0-100)
        LoanStatus status;
        string purpose; // Purpose of the loan, stored off-chain or via IPFS hash
        bool isCollateralized; // Whether the loan is backed by collateral
        uint256 collateralAmount; // Amount of collateral if applicable
        address collateralToken; // Token used for collateral if applicable
        uint256[] repaymentSchedule; // Array of timestamps for scheduled repayments
        uint256[] repaymentAmounts; // Array of amounts for scheduled repayments
    }

    enum LoanStatus {
        Requested, // Loan request created by borrower
        Funded, // Loan funded by lender, awaiting borrower withdrawal or automatic disbursement
        Active, // Funds disbursed to borrower, repayment period started
        Repaid, // Loan fully repaid by borrower
        Defaulted, // Loan not repaid by due date
        Cancelled, // Loan request cancelled by borrower before funding
        Rejected // Loan request rejected by risk assessment
    }

    uint256 public nextLoanId;
    mapping(uint256 => Loan) public loans;
    mapping(address => uint256[]) public userLoanIds; // Borrower or Lender to their loan IDs
    mapping(address => uint256) public userReputationScores; // User reputation scores

    // Tracks the amount of each ERC20 token that is currently committed to
    // active loans (principal awaiting disbursement + deposited collateral).
    // This prevents withdrawStuckTokens() from being able to sweep out funds
    // that belong to borrowers/lenders rather than being genuinely "stuck".
    mapping(address => uint256) public totalEscrowed;

    uint256 public platformFeeRate; // e.g., 100 for 1.00% fee on interest
    address public feeRecipient; // Address to receive platform fees
    address public riskAssessor; // Address authorized to set risk scores
    uint256 public minRepaymentInterval; // Minimum time between repayments
    uint256 public gracePeriod; // Grace period for late repayments before default

    event LoanRequested(
        uint256 indexed loanId,
        address indexed borrower,
        address indexed token,
        uint256 principal,
        uint256 interestRate,
        uint256 duration,
        string purpose,
        bool isCollateralized
    );
    event LoanFunded(
        uint256 indexed loanId,
        address indexed lender,
        uint256 fundedTime
    );
    event LoanDisbursed(
        uint256 indexed loanId,
        address indexed borrower,
        uint256 amount,
        uint256 disbursedTime
    );
    event LoanRepaid(
        uint256 indexed loanId,
        address indexed borrower,
        uint256 amountPaid,
        uint256 totalRepaid,
        uint256 remainingBalance
    );
    event LoanDefaulted(uint256 indexed loanId, uint256 defaultTime);
    event LoanCancelled(uint256 indexed loanId);
    event LoanRejected(uint256 indexed loanId, uint256 riskScore);
    event PlatformFeeUpdated(uint256 newFeeRate);
    event FeeRecipientUpdated(address newFeeRecipient);
    event RiskAssessorUpdated(address newRiskAssessor);
    event RiskScoreAssigned(uint256 indexed loanId, uint256 riskScore);
    event CollateralDeposited(
        uint256 indexed loanId,
        address token,
        uint256 amount
    );
    event CollateralReleased(
        uint256 indexed loanId,
        address token,
        uint256 amount,
        address recipient
    );
    event RepaymentScheduleCreated(
        uint256 indexed loanId,
        uint256[] schedule,
        uint256[] amounts
    );
    event ReputationScoreUpdated(address indexed user, uint256 newScore);

    modifier onlyBorrower(uint256 _loanId) {
        require(
            loans[_loanId].borrower == msg.sender,
            "LendSmartLoan: Caller is not the borrower"
        );
        _;
    }

    modifier onlyLender(uint256 _loanId) {
        require(
            loans[_loanId].lender == msg.sender,
            "LendSmartLoan: Caller is not the lender"
        );
        _;
    }

    modifier loanExists(uint256 _loanId) {
        require(
            loans[_loanId].borrower != address(0),
            "LendSmartLoan: Loan does not exist"
        );
        _;
    }

    modifier onlyRiskAssessor() {
        require(
            msg.sender == riskAssessor,
            "LendSmartLoan: Caller is not the risk assessor"
        );
        _;
    }

    /**
     * @dev Constructor to initialize the contract owner, platform fee, and fee recipient.
     * @param _initialOwner The address of the contract owner.
     * @param _initialFeeRate The initial platform fee rate (e.g., 100 for 1.00%).
     * @param _initialFeeRecipient The address where platform fees will be sent.
     * @param _initialRiskAssessor The address authorized to set risk scores.
     */
    constructor(
        address _initialOwner,
        uint256 _initialFeeRate,
        address _initialFeeRecipient,
        address _initialRiskAssessor
    ) Ownable(_initialOwner) {
        require(
            _initialFeeRecipient != address(0),
            "Fee recipient cannot be zero address"
        );
        require(
            _initialRiskAssessor != address(0),
            "Risk assessor cannot be zero address"
        );

        platformFeeRate = _initialFeeRate;
        feeRecipient = _initialFeeRecipient;
        riskAssessor = _initialRiskAssessor;
        nextLoanId = 1; // Start loan IDs from 1
        minRepaymentInterval = 7 days; // Default minimum time between repayments
        gracePeriod = 3 days; // Default grace period for late repayments
    }

    /**
     * @dev Allows a borrower to request a new loan.
     * @param _token The address of the ERC20 token for the loan.
     * @param _principal The amount of tokens requested.
     * @param _interestRate The annual interest rate (e.g., 500 for 5.00%).
     * @param _duration The duration of the loan in seconds.
     * @param _purpose A description or IPFS hash for the loan purpose.
     * @param _isCollateralized Whether the loan will be backed by collateral.
     * @param _collateralToken The token to be used as collateral (if applicable).
     * @param _collateralAmount The amount of collateral to be provided (if applicable).
     */
    function requestLoan(
        address _token,
        uint256 _principal,
        uint256 _interestRate,
        uint256 _duration,
        string memory _purpose,
        bool _isCollateralized,
        address _collateralToken,
        uint256 _collateralAmount
    ) external whenNotPaused nonReentrant returns (uint256) {
        require(
            _token != address(0),
            "LendSmartLoan: Token address cannot be zero"
        );
        require(
            _principal > 0,
            "LendSmartLoan: Principal must be greater than zero"
        );
        require(
            _duration > 0,
            "LendSmartLoan: Duration must be greater than zero"
        );

        // If collateralized, validate collateral details
        if (_isCollateralized) {
            require(
                _collateralToken != address(0),
                "LendSmartLoan: Collateral token cannot be zero address"
            );
            require(
                _collateralAmount > 0,
                "LendSmartLoan: Collateral amount must be greater than zero"
            );
        }

        uint256 loanId = nextLoanId++;
        uint256 totalInterest =
            (_principal * _interestRate * _duration) / (10000 * 365 days); // 10000 for rate precision (e.g. 5.00% = 500)
        uint256 repaymentAmount = _principal + totalInterest;

        // Create empty arrays for repayment schedule
        uint256[] memory emptySchedule = new uint256[](0);
        uint256[] memory emptyAmounts = new uint256[](0);

        loans[loanId] = Loan({
            id: loanId,
            borrower: msg.sender,
            lender: address(0),
            token: _token,
            principal: _principal,
            interestRate: _interestRate,
            duration: _duration,
            requestedTime: block.timestamp,
            fundedTime: 0,
            disbursedTime: 0,
            repaymentAmount: repaymentAmount,
            amountRepaid: 0,
            riskScore: 0, // Will be set by risk assessor
            status: LoanStatus.Requested,
            purpose: _purpose,
            isCollateralized: _isCollateralized,
            collateralAmount: _isCollateralized ? _collateralAmount : 0,
            collateralToken: _isCollateralized ? _collateralToken : address(0),
            repaymentSchedule: emptySchedule,
            repaymentAmounts: emptyAmounts
        });

        userLoanIds[msg.sender].push(loanId);

        emit LoanRequested(
            loanId,
            msg.sender,
            _token,
            _principal,
            _interestRate,
            _duration,
            _purpose,
            _isCollateralized
        );

        return loanId;
    }

    /**
     * @dev Allows the risk assessor to set a risk score for a loan and potentially reject high-risk loans.
     * @param _loanId The ID of the loan to assess.
     * @param _riskScore The risk score (0-100) assigned by the AI model.
     * @param _shouldReject Whether to reject the loan based on the risk score.
     */
    function setLoanRiskScore(
        uint256 _loanId,
        uint256 _riskScore,
        bool _shouldReject
    ) external whenNotPaused nonReentrant loanExists(_loanId) onlyRiskAssessor {
        require(
            _riskScore <= 100,
            "LendSmartLoan: Risk score must be between 0 and 100"
        );

        Loan storage loan = loans[_loanId];
        require(
            loan.status == LoanStatus.Requested,
            "LendSmartLoan: Loan not in Requested state"
        );

        loan.riskScore = _riskScore;
        emit RiskScoreAssigned(_loanId, _riskScore);

        if (_shouldReject) {
            loan.status = LoanStatus.Rejected;
            emit LoanRejected(_loanId, _riskScore);
        }
    }

    /**
     * @dev Allows a borrower to deposit collateral for a collateralized loan.
     * @param _loanId The ID of the loan to deposit collateral for.
     */
    function depositCollateral(
        uint256 _loanId
    )
        external
        whenNotPaused
        nonReentrant
        loanExists(_loanId)
        onlyBorrower(_loanId)
    {
        Loan storage loan = loans[_loanId];
        require(
            loan.isCollateralized,
            "LendSmartLoan: Loan is not collateralized"
        );
        require(
            loan.status == LoanStatus.Requested,
            "LendSmartLoan: Loan not in Requested state"
        );

        IERC20 collateralToken = IERC20(loan.collateralToken);
        require(
            collateralToken.balanceOf(msg.sender) >= loan.collateralAmount,
            "LendSmartLoan: Insufficient collateral token balance"
        );
        require(
            collateralToken.allowance(msg.sender, address(this)) >=
                loan.collateralAmount,
            "LendSmartLoan: Contract not approved to spend collateral tokens"
        );

        // Transfer collateral from borrower to this contract
        collateralToken.safeTransferFrom(
            msg.sender,
            address(this),
            loan.collateralAmount
        );

        totalEscrowed[loan.collateralToken] += loan.collateralAmount;

        emit CollateralDeposited(
            _loanId,
            loan.collateralToken,
            loan.collateralAmount
        );
    }

    /**
     * @dev Allows a lender to fund an existing loan request.
     * The lender must have approved the contract to spend their tokens.
     * @param _loanId The ID of the loan to fund.
     */
    function fundLoan(
        uint256 _loanId
    ) external whenNotPaused nonReentrant loanExists(_loanId) {
        Loan storage loan = loans[_loanId];
        require(
            loan.status == LoanStatus.Requested,
            "LendSmartLoan: Loan not in Requested state"
        );
        require(
            msg.sender != loan.borrower,
            "LendSmartLoan: Borrower cannot fund their own loan"
        );

        // If loan is collateralized, ensure collateral has been deposited
        if (loan.isCollateralized) {
            IERC20 collateralToken = IERC20(loan.collateralToken);
            require(
                collateralToken.balanceOf(address(this)) >=
                    loan.collateralAmount,
                "LendSmartLoan: Collateral not deposited"
            );
        }

        IERC20 token = IERC20(loan.token);
        require(
            token.balanceOf(msg.sender) >= loan.principal,
            "LendSmartLoan: Insufficient token balance"
        );
        require(
            token.allowance(msg.sender, address(this)) >= loan.principal,
            "LendSmartLoan: Contract not approved to spend tokens"
        );

        // Transfer principal from lender to this contract
        token.safeTransferFrom(msg.sender, address(this), loan.principal);

        totalEscrowed[loan.token] += loan.principal;

        loan.lender = msg.sender;
        loan.fundedTime = block.timestamp;
        loan.status = LoanStatus.Funded;

        userLoanIds[msg.sender].push(_loanId);

        emit LoanFunded(_loanId, msg.sender, loan.fundedTime);
    }

    /**
     * @dev Creates a repayment schedule for a funded loan.
     * @param _loanId The ID of the loan to create a schedule for.
     * @param _numberOfPayments The number of repayments to schedule.
     */
    function createRepaymentSchedule(
        uint256 _loanId,
        uint256 _numberOfPayments
    ) external whenNotPaused nonReentrant loanExists(_loanId) {
        require(
            _numberOfPayments > 0,
            "LendSmartLoan: Number of payments must be greater than zero"
        );

        Loan storage loan = loans[_loanId];
        require(
            msg.sender == loan.borrower ||
                msg.sender == loan.lender ||
                msg.sender == owner(),
            "LendSmartLoan: Not authorized to create schedule"
        );
        require(
            loan.status == LoanStatus.Funded,
            "LendSmartLoan: Loan not in Funded state"
        );

        // Calculate payment interval and amount per payment
        uint256 paymentInterval = loan.duration / _numberOfPayments;
        require(
            paymentInterval >= minRepaymentInterval,
            "LendSmartLoan: Payment interval too short"
        );

        uint256 basePaymentAmount = loan.repaymentAmount / _numberOfPayments;
        uint256 remainder = loan.repaymentAmount % _numberOfPayments;

        // Create arrays for schedule and amounts
        uint256[] memory schedule = new uint256[](_numberOfPayments);
        uint256[] memory amounts = new uint256[](_numberOfPayments);

        for (uint256 i = 0; i < _numberOfPayments; i++) {
            schedule[i] = loan.fundedTime + ((i + 1) * paymentInterval);

            // Add remainder to first payment
            if (i == 0) {
                amounts[i] = basePaymentAmount + remainder;
            } else {
                amounts[i] = basePaymentAmount;
            }
        }

        loan.repaymentSchedule = schedule;
        loan.repaymentAmounts = amounts;

        emit RepaymentScheduleCreated(_loanId, schedule, amounts);
    }

    /**
     * @dev Disburses funds to the borrower after loan funding.
     * @param _loanId The ID of the loan to disburse.
     */
    function disburseLoan(
        uint256 _loanId
    ) external whenNotPaused nonReentrant loanExists(_loanId) {
        Loan storage loan = loans[_loanId];
        require(
            loan.status == LoanStatus.Funded,
            "LendSmartLoan: Loan not in Funded state"
        );
        require(
            msg.sender == loan.borrower ||
                msg.sender == loan.lender ||
                msg.sender == owner(),
            "LendSmartLoan: Not authorized to disburse"
        );

        // Ensure repayment schedule is created if we want to enforce it
        // Uncomment the following line if repayment schedule is mandatory
        // require(loan.repaymentSchedule.length > 0, "LendSmartLoan: Repayment schedule not created");

        // Effects before interactions: flip status and release the escrow
        // accounting before the external token transfer.
        loan.status = LoanStatus.Active;
        loan.disbursedTime = block.timestamp;
        totalEscrowed[loan.token] -= loan.principal;

        IERC20 token = IERC20(loan.token);
        token.safeTransfer(loan.borrower, loan.principal);

        emit LoanDisbursed(
            _loanId,
            loan.borrower,
            loan.principal,
            loan.disbursedTime
        );

        // Update borrower reputation score positively for receiving a loan
        _updateReputationScore(loan.borrower, 1);
    }

    /**
     * @dev Allows a borrower to repay their loan.
     * The borrower must have approved the contract to spend their tokens.
     * @param _loanId The ID of the loan to repay.
     * @param _amount The amount of tokens to repay.
     */
    function repayLoan(
        uint256 _loanId,
        uint256 _amount
    )
        external
        whenNotPaused
        nonReentrant
        loanExists(_loanId)
        onlyBorrower(_loanId)
    {
        Loan storage loan = loans[_loanId];
        require(
            loan.status == LoanStatus.Active,
            "LendSmartLoan: Loan not in Active state"
        );
        require(
            _amount > 0,
            "LendSmartLoan: Repayment amount must be greater than zero"
        );

        IERC20 token = IERC20(loan.token);
        require(
            token.balanceOf(msg.sender) >= _amount,
            "LendSmartLoan: Insufficient token balance for repayment"
        );
        require(
            token.allowance(msg.sender, address(this)) >= _amount,
            "LendSmartLoan: Contract not approved to spend tokens for repayment"
        );

        uint256 amountToRepayThisTime = _amount;
        uint256 remainingDue = loan.repaymentAmount - loan.amountRepaid;

        if (loan.amountRepaid + _amount > loan.repaymentAmount) {
            amountToRepayThisTime = remainingDue; // Pay only remaining due
        }

        // Transfer repayment from borrower to this contract
        token.safeTransferFrom(
            msg.sender,
            address(this),
            amountToRepayThisTime
        );

        loan.amountRepaid += amountToRepayThisTime;
        remainingDue = loan.repaymentAmount - loan.amountRepaid;

        // Distribute funds: principal and interest to lender, fee to platform
        uint256 interestPortion = 0;
        uint256 principalPortion = amountToRepayThisTime;

        if (loan.amountRepaid > loan.principal) {
            // If repayment starts covering interest
            uint256 totalInterestDue = loan.repaymentAmount - loan.principal;
            uint256 interestPaidThisTime = amountToRepayThisTime;

            if (loan.amountRepaid - amountToRepayThisTime < loan.principal) {
                // If this payment crosses principal boundary
                interestPaidThisTime = loan.amountRepaid - loan.principal;
            }

            if (interestPaidThisTime > totalInterestDue) {
                interestPaidThisTime = totalInterestDue;
            }

            interestPortion = interestPaidThisTime;
            principalPortion = amountToRepayThisTime - interestPortion;
        }

        uint256 platformFee = 0;
        if (interestPortion > 0 && platformFeeRate > 0) {
            platformFee = (interestPortion * platformFeeRate) / 10000;
            if (platformFee > 0) {
                token.safeTransfer(feeRecipient, platformFee);
            }
        }

        uint256 amountToLender = amountToRepayThisTime - platformFee;
        if (amountToLender > 0) {
            token.safeTransfer(loan.lender, amountToLender);
        }

        emit LoanRepaid(
            _loanId,
            msg.sender,
            amountToRepayThisTime,
            loan.amountRepaid,
            remainingDue
        );

        if (loan.amountRepaid >= loan.repaymentAmount) {
            loan.status = LoanStatus.Repaid;

            // Release collateral if loan was collateralized
            if (loan.isCollateralized) {
                _releaseCollateral(_loanId);
            }

            // Update borrower reputation score positively for repaying loan
            _updateReputationScore(loan.borrower, 2);
        }
    }

    /**
     * @dev Internal function to release collateral back to borrower after loan repayment.
     * @param _loanId The ID of the loan to release collateral for.
     */
    function _releaseCollateral(uint256 _loanId) internal {
        Loan storage loan = loans[_loanId];
        require(
            loan.isCollateralized,
            "LendSmartLoan: Loan is not collateralized"
        );

        if (loan.collateralAmount > 0 && loan.collateralToken != address(0)) {
            IERC20 collateralToken = IERC20(loan.collateralToken);
            uint256 releasedAmount = loan.collateralAmount;
            address collateralTokenAddress = loan.collateralToken;

            // Reset collateral amount and escrow accounting before the
            // external call to prevent double-release.
            loan.collateralAmount = 0;
            totalEscrowed[collateralTokenAddress] -= releasedAmount;

            collateralToken.safeTransfer(loan.borrower, releasedAmount);

            emit CollateralReleased(
                _loanId,
                collateralTokenAddress,
                releasedAmount,
                loan.borrower
            );
        }
    }

    /**
     * @dev Allows a borrower to cancel their loan request if it has not been funded yet.
     * @param _loanId The ID of the loan to cancel.
     */
    function cancelLoanRequest(
        uint256 _loanId
    )
        external
        whenNotPaused
        nonReentrant
        loanExists(_loanId)
        onlyBorrower(_loanId)
    {
        Loan storage loan = loans[_loanId];
        require(
            loan.status == LoanStatus.Requested,
            "LendSmartLoan: Loan not in Requested state or already funded"
        );

        loan.status = LoanStatus.Cancelled;

        // Return collateral if it was deposited
        if (loan.isCollateralized && loan.collateralAmount > 0) {
            _releaseCollateral(_loanId);
        }

        emit LoanCancelled(_loanId);
    }

    /**
     * @dev Allows the owner or lender to mark a loan as defaulted if it's past due.
     * @param _loanId The ID of the loan to mark as defaulted.
     */
    function markLoanAsDefaulted(
        uint256 _loanId
    ) external whenNotPaused nonReentrant loanExists(_loanId) {
        Loan storage loan = loans[_loanId];
        require(
            loan.status == LoanStatus.Active,
            "LendSmartLoan: Loan not in Active state"
        );
        require(
            msg.sender == loan.lender || msg.sender == owner(),
            "LendSmartLoan: Only lender or owner can mark as defaulted"
        );

        // Check if loan is past due (end of duration + grace period)
        require(
            block.timestamp > loan.disbursedTime + loan.duration + gracePeriod,
            "LendSmartLoan: Loan not past due date with grace period"
        );

        loan.status = LoanStatus.Defaulted;

        // If loan was collateralized, transfer collateral to lender
        if (loan.isCollateralized && loan.collateralAmount > 0) {
            IERC20 collateralToken = IERC20(loan.collateralToken);
            uint256 seizedAmount = loan.collateralAmount;
            address collateralTokenAddress = loan.collateralToken;

            // Reset collateral amount and escrow accounting before the
            // external call to prevent double-release.
            loan.collateralAmount = 0;
            totalEscrowed[collateralTokenAddress] -= seizedAmount;

            collateralToken.safeTransfer(loan.lender, seizedAmount);

            emit CollateralReleased(
                _loanId,
                collateralTokenAddress,
                seizedAmount,
                loan.lender
            );
        }

        // Update borrower reputation score negatively for defaulting
        _updateReputationScore(loan.borrower, -3);

        emit LoanDefaulted(_loanId, block.timestamp);
    }

    /**
     * @dev Internal function to update a user's reputation score.
     * @param _user The address of the user.
     * @param _scoreDelta The change in score (positive or negative).
     */
    function _updateReputationScore(address _user, int8 _scoreDelta) internal {
        uint256 currentScore = userReputationScores[_user];

        if (_scoreDelta > 0) {
            // Increase score with a cap at 100
            uint256 newScore = currentScore + uint8(_scoreDelta);
            userReputationScores[_user] = newScore > 100 ? 100 : newScore;
        } else if (_scoreDelta < 0) {
            // Decrease score with a floor at 0
            uint256 delta = uint8(-_scoreDelta);
            userReputationScores[_user] =
                delta > currentScore ? 0 : currentScore - delta;
        }

        emit ReputationScoreUpdated(_user, userReputationScores[_user]);
    }

    /**
     * @dev Allows the owner to update the platform fee rate.
     * @param _newFeeRate The new platform fee rate (e.g., 150 for 1.50%).
     */
    function setPlatformFeeRate(uint256 _newFeeRate) external onlyOwner {
        require(_newFeeRate <= 1000, "LendSmartLoan: Fee rate too high"); // Max 10%
        platformFeeRate = _newFeeRate;
        emit PlatformFeeUpdated(_newFeeRate);
    }

    /**
     * @dev Allows the owner to update the fee recipient address.
     * @param _newFeeRecipient The new address for receiving platform fees.
     */
    function setFeeRecipient(address _newFeeRecipient) external onlyOwner {
        require(
            _newFeeRecipient != address(0),
            "LendSmartLoan: New fee recipient cannot be zero address"
        );
        feeRecipient = _newFeeRecipient;
        emit FeeRecipientUpdated(_newFeeRecipient);
    }

    /**
     * @dev Allows the owner to update the risk assessor address.
     * @param _newRiskAssessor The new address authorized to set risk scores.
     */
    function setRiskAssessor(address _newRiskAssessor) external onlyOwner {
        require(
            _newRiskAssessor != address(0),
            "LendSmartLoan: New risk assessor cannot be zero address"
        );
        riskAssessor = _newRiskAssessor;
        emit RiskAssessorUpdated(_newRiskAssessor);
    }

    /**
     * @dev Allows the owner to update the minimum repayment interval.
     * @param _newInterval The new minimum interval in seconds.
     */
    function setMinRepaymentInterval(uint256 _newInterval) external onlyOwner {
        minRepaymentInterval = _newInterval;
    }

    /**
     * @dev Allows the owner to update the grace period for late repayments.
     * @param _newGracePeriod The new grace period in seconds.
     */
    function setGracePeriod(uint256 _newGracePeriod) external onlyOwner {
        gracePeriod = _newGracePeriod;
    }

    /**
     * @dev Allows the owner to pause the contract in case of emergencies.
     */
    function pause() external onlyOwner {
        _pause();
    }

    /**
     * @dev Allows the owner to unpause the contract.
     */
    function unpause() external onlyOwner {
        _unpause();
    }

    /**
     * @dev Retrieves all loan IDs associated with a user (borrower or lender).
     * @param _user The address of the user.
     * @return An array of loan IDs.
     */
    function getUserLoans(
        address _user
    ) external view returns (uint256[] memory) {
        return userLoanIds[_user];
    }

    /**
     * @dev Retrieves the reputation score for a user.
     * @param _user The address of the user.
     * @return The user's reputation score.
     */
    function getUserReputationScore(
        address _user
    ) external view returns (uint256) {
        return userReputationScores[_user];
    }

    /**
     * @dev Retrieves details for a specific loan.
     * @param _loanId The ID of the loan.
     * @return loan The Loan struct.
     * @return schedule The repayment schedule timestamps.
     * @return amounts The repayment amounts.
     */
    function getLoanDetails(
        uint256 _loanId
    )
        external
        view
        loanExists(_loanId)
        returns (
            Loan memory loan,
            uint256[] memory schedule,
            uint256[] memory amounts
        )
    {
        loan = loans[_loanId];
        schedule = loan.repaymentSchedule;
        amounts = loan.repaymentAmounts;
    }

    /**
     * @dev Fallback function to receive Ether (e.g., if someone sends ETH directly).
     * It is recommended to make this function revert or handle ETH appropriately if not intended.
     */
    receive() external payable {
        // Reverting is safer if ETH is not meant to be held by the contract this way.
        revert(
            "LendSmartLoan: Direct Ether payments not accepted. Use specific functions for ERC20 loan operations."
        );
    }

    /**
     * @dev Owner can withdraw ERC20 tokens accidentally sent to the contract.
     * This can NEVER touch funds that are actively escrowed for a loan
     * (principal awaiting disbursement or deposited collateral) - only the
     * surplus balance above `totalEscrowed[_tokenAddress]` is withdrawable,
     * so this function cannot be used to rug borrower collateral or lender
     * principal.
     * @param _tokenAddress The address of the token to withdraw.
     * @param _to The address to send the tokens to.
     * @param _amount The amount of tokens to withdraw.
     */
    function withdrawStuckTokens(
        address _tokenAddress,
        address _to,
        uint256 _amount
    ) external onlyOwner {
        require(
            _to != address(0),
            "LendSmartLoan: Cannot send to zero address"
        );
        IERC20 token = IERC20(_tokenAddress);
        uint256 contractBalance = token.balanceOf(address(this));
        uint256 escrowed = totalEscrowed[_tokenAddress];
        uint256 withdrawable =
            contractBalance > escrowed ? contractBalance - escrowed : 0;
        require(
            _amount <= withdrawable,
            "LendSmartLoan: Amount exceeds withdrawable (non-escrowed) balance"
        );
        token.safeTransfer(_to, _amount);
    }
}
