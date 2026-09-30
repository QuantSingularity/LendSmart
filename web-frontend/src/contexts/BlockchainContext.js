import { ethers } from "ethers";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation } from "react-router-dom";
import LendSmartLoanABI from "../utils/LendSmartLoanABI.json";

// Create blockchain context
const BlockchainContext = createContext();

export const useBlockchain = () => useContext(BlockchainContext);

export const BlockchainProvider = ({ children }) => {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [lendSmartLoanContract, setLendSmartLoanContract] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [error, setError] = useState(null);
  const location = useLocation();

  // Clear stale errors on navigation. Without this, an error from an
  // earlier action on a different page (e.g. clicking "Connect Wallet" on
  // the dashboard before the provider finished initializing) stayed in
  // this shared context forever and silently reappeared as an unrelated
  // looking error banner on whatever page the user navigated to next -
  // this is exactly how "Provider not initialized" showed up on the Apply
  // for Loan page without the user doing anything there.
  useEffect(() => {
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Contract addresses - should be environment variables in production
  const LEND_SMART_LOAN_ADDRESS =
    process.env.REACT_APP_LEND_SMART_LOAN_ADDRESS ||
    "0x5FbDB2315678afecb367f032d93F642f64180aa3";

  const handleChainChanged = useCallback(() => {
    // Reload the page to update the network
    window.location.reload();
  }, []);

  const handleAccountsChanged = useCallback(
    async (accounts) => {
      if (accounts.length === 0) {
        setAccount(null);
        setIsConnected(false);
        return;
      }
      setAccount(accounts[0]);
      setIsConnected(true);
      if (provider) {
        const newSigner = await provider.getSigner();
        setSigner(newSigner);
        const contract = new ethers.Contract(
          LEND_SMART_LOAN_ADDRESS,
          LendSmartLoanABI.abi,
          newSigner,
        );
        setLendSmartLoanContract(contract);
      }
    },
    [provider, LEND_SMART_LOAN_ADDRESS],
  );

  // Mirrors `provider`/`lendSmartLoanContract` synchronously so connectWallet
  // (and anything else called right after setup) never reads a stale null
  // value due to React state updates not having flushed yet - the same
  // class of race that could previously cause "Provider not initialized"
  // even when a wallet extension was installed and reachable.
  const providerRef = useRef(null);
  const contractRef = useRef(null);

  // Set up (or reuse) the ethers provider + read-only contract instance.
  // Safe to call multiple times - if a provider already exists it's
  // reused rather than recreated.
  const setupProvider = useCallback(async () => {
    if (providerRef.current) {
      return { provider: providerRef.current, contract: contractRef.current };
    }

    if (!window.ethereum) {
      setError("Please install MetaMask or another Ethereum wallet");
      return { provider: null, contract: null };
    }

    try {
      const web3Provider = new ethers.BrowserProvider(window.ethereum);
      const network = await web3Provider.getNetwork();
      const contract = new ethers.Contract(
        LEND_SMART_LOAN_ADDRESS,
        LendSmartLoanABI.abi,
        web3Provider,
      );

      providerRef.current = web3Provider;
      contractRef.current = contract;
      setProvider(web3Provider);
      setChainId(network.chainId);
      setLendSmartLoanContract(contract);

      return { provider: web3Provider, contract };
    } catch (err) {
      console.error("Error initializing provider:", err);
      setError("Failed to initialize blockchain connection");
      return { provider: null, contract: null };
    }
  }, [LEND_SMART_LOAN_ADDRESS]);

  // Initialize provider on mount
  useEffect(() => {
    if (!window.ethereum) {
      setIsInitializing(false);
      return undefined;
    }

    setupProvider().finally(() => setIsInitializing(false));

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleAccountsChanged, handleChainChanged, setupProvider]);

  // Connect wallet
  const connectWallet = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Lazily finish provider setup if it hasn't completed yet, instead
      // of failing outright - this is what used to produce a spurious
      // "Provider not initialized" error when the user clicked Connect
      // Wallet before the mount-time initialization had resolved.
      const { provider: activeProvider, contract: activeContract } =
        await setupProvider();

      if (!activeProvider || !activeContract) {
        setError((current) => current || "Please install a wallet to connect");
        setIsLoading(false);
        return;
      }

      // Request account access
      const accounts = await window.ethereum.request({
        method: "eth_requestAccounts",
      });
      const connectedAccount = accounts[0];
      setAccount(connectedAccount);

      // Get signer
      const newSigner = await activeProvider.getSigner();
      setSigner(newSigner);

      // Connect contract with signer
      const contractWithSigner = activeContract.connect(newSigner);
      contractRef.current = contractWithSigner;
      setLendSmartLoanContract(contractWithSigner);

      setIsConnected(true);
      setIsLoading(false);
    } catch (err) {
      console.error("Error connecting wallet:", err);
      setError("Failed to connect wallet");
      setIsLoading(false);
    }
  }, [setupProvider]);

  // Disconnect wallet
  const disconnectWallet = useCallback(() => {
    setAccount(null);
    setSigner(null);
    setIsConnected(false);
  }, []);

  // Request a loan
  const requestLoan = useCallback(
    async (loanData) => {
      if (!isConnected) {
        setError("Please connect your wallet first");
        return null;
      }

      try {
        setIsLoading(true);
        setError(null);

        const tx = await lendSmartLoanContract.requestLoan(
          loanData.token,
          ethers.parseUnits(
            loanData.principal.toString(),
            loanData.decimals || 18,
          ),
          loanData.interestRate,
          loanData.duration,
          loanData.purpose,
          loanData.isCollateralized || false,
          loanData.collateralToken || ethers.ZeroAddress,
          loanData.collateralAmount
            ? ethers.parseUnits(
                loanData.collateralAmount.toString(),
                loanData.collateralDecimals || 18,
              )
            : 0,
        );

        const receipt = await tx.wait();

        // Find the LoanRequested event to get the loan ID
        const event = receipt.logs
          .filter(
            (log) => log.fragment && log.fragment.name === "LoanRequested",
          )
          .map((log) => {
            return {
              loanId: log.args.loanId.toString(),
              borrower: log.args.borrower,
              token: log.args.token,
              principal: log.args.principal.toString(),
              interestRate: log.args.interestRate.toString(),
              duration: log.args.duration.toString(),
              purpose: log.args.purpose,
              isCollateralized: log.args.isCollateralized,
            };
          })[0];

        setIsLoading(false);
        return {
          transactionHash: receipt.hash,
          loanId: event.loanId,
          event,
        };
      } catch (err) {
        console.error("Error requesting loan:", err);
        setError("Failed to request loan");
        setIsLoading(false);
        return null;
      }
    },
    [isConnected, lendSmartLoanContract],
  );

  // Get user loans
  const getUserLoans = useCallback(
    async (userAddress) => {
      if (!lendSmartLoanContract) {
        setError("Contract not initialized");
        return [];
      }

      try {
        setIsLoading(true);
        setError(null);

        const address = userAddress || account;
        if (!address) {
          setError("No address provided");
          setIsLoading(false);
          return [];
        }

        const loanIds = await lendSmartLoanContract.getUserLoans(address);

        setIsLoading(false);
        return loanIds.map((id) => id.toString());
      } catch (err) {
        console.error("Error getting user loans:", err);
        setError("Failed to get user loans");
        setIsLoading(false);
        return [];
      }
    },
    [lendSmartLoanContract, account],
  );

  // Helper function to convert numeric loan status to string
  const getLoanStatusString = useCallback((statusCode) => {
    const statusMap = {
      0: "Requested",
      1: "Funded",
      2: "Active",
      3: "Repaid",
      4: "Defaulted",
      5: "Cancelled",
      6: "Rejected",
    };

    return statusMap[statusCode] || "Unknown";
  }, []);

  // Get loan details
  const getLoanDetails = useCallback(
    async (loanId) => {
      if (!lendSmartLoanContract) {
        setError("Contract not initialized");
        return null;
      }

      try {
        setIsLoading(true);
        setError(null);

        const [loan, schedule, amounts] =
          await lendSmartLoanContract.getLoanDetails(loanId);

        // Convert BigInt values to strings for JSON compatibility
        const formattedLoan = {
          id: loan.id.toString(),
          borrower: loan.borrower,
          lender: loan.lender,
          token: loan.token,
          principal: loan.principal.toString(),
          interestRate: loan.interestRate.toString(),
          duration: loan.duration.toString(),
          requestedTime: loan.requestedTime.toString(),
          fundedTime: loan.fundedTime.toString(),
          disbursedTime: loan.disbursedTime.toString(),
          repaymentAmount: loan.repaymentAmount.toString(),
          amountRepaid: loan.amountRepaid.toString(),
          riskScore: loan.riskScore.toString(),
          status: getLoanStatusString(loan.status),
          purpose: loan.purpose,
          isCollateralized: loan.isCollateralized,
          collateralAmount: loan.collateralAmount.toString(),
          collateralToken: loan.collateralToken,
        };

        // Format schedule and amounts
        const formattedSchedule = schedule.map((time) => time.toString());
        const formattedAmounts = amounts.map((amount) => amount.toString());

        setIsLoading(false);
        return {
          loan: formattedLoan,
          repaymentSchedule: formattedSchedule,
          repaymentAmounts: formattedAmounts,
        };
      } catch (err) {
        console.error("Error getting loan details:", err);
        setError(`Failed to get details for loan ID ${loanId}`);
        setIsLoading(false);
        return null;
      }
    },
    [lendSmartLoanContract, getLoanStatusString],
  );

  // Fund a loan
  const fundLoan = useCallback(
    async (loanId) => {
      if (!isConnected) {
        setError("Please connect your wallet first");
        return null;
      }

      try {
        setIsLoading(true);
        setError(null);

        const tx = await lendSmartLoanContract.fundLoan(loanId);
        const receipt = await tx.wait();

        setIsLoading(false);
        return {
          transactionHash: receipt.hash,
          status: receipt.status === 1 ? "success" : "failed",
        };
      } catch (err) {
        console.error("Error funding loan:", err);
        setError(`Failed to fund loan ID ${loanId}`);
        setIsLoading(false);
        return null;
      }
    },
    [isConnected, lendSmartLoanContract],
  );

  // Disburse a loan
  const disburseLoan = useCallback(
    async (loanId) => {
      if (!isConnected) {
        setError("Please connect your wallet first");
        return null;
      }

      try {
        setIsLoading(true);
        setError(null);

        const tx = await lendSmartLoanContract.disburseLoan(loanId);
        const receipt = await tx.wait();

        setIsLoading(false);
        return {
          transactionHash: receipt.hash,
          status: receipt.status === 1 ? "success" : "failed",
        };
      } catch (err) {
        console.error("Error disbursing loan:", err);
        setError(`Failed to disburse loan ID ${loanId}`);
        setIsLoading(false);
        return null;
      }
    },
    [isConnected, lendSmartLoanContract],
  );

  // Repay a loan
  const repayLoan = useCallback(
    async (loanId, amount, decimals = 18) => {
      if (!isConnected) {
        setError("Please connect your wallet first");
        return null;
      }

      try {
        setIsLoading(true);
        setError(null);

        const tx = await lendSmartLoanContract.repayLoan(
          loanId,
          ethers.parseUnits(amount, decimals),
        );
        const receipt = await tx.wait();

        setIsLoading(false);
        return {
          transactionHash: receipt.hash,
          status: receipt.status === 1 ? "success" : "failed",
        };
      } catch (err) {
        console.error("Error repaying loan:", err);
        setError(`Failed to repay loan ID ${loanId}`);
        setIsLoading(false);
        return null;
      }
    },
    [isConnected, lendSmartLoanContract],
  );

  // Deposit collateral
  const depositCollateral = useCallback(
    async (loanId) => {
      if (!isConnected) {
        setError("Please connect your wallet first");
        return null;
      }

      try {
        setIsLoading(true);
        setError(null);

        const tx = await lendSmartLoanContract.depositCollateral(loanId);
        const receipt = await tx.wait();

        setIsLoading(false);
        return {
          transactionHash: receipt.hash,
          status: receipt.status === 1 ? "success" : "failed",
        };
      } catch (err) {
        console.error("Error depositing collateral:", err);
        setError(`Failed to deposit collateral for loan ID ${loanId}`);
        setIsLoading(false);
        return null;
      }
    },
    [isConnected, lendSmartLoanContract],
  );

  // Create repayment schedule
  const createRepaymentSchedule = useCallback(
    async (loanId, numberOfPayments) => {
      if (!isConnected) {
        setError("Please connect your wallet first");
        return null;
      }

      try {
        setIsLoading(true);
        setError(null);

        const tx = await lendSmartLoanContract.createRepaymentSchedule(
          loanId,
          numberOfPayments,
        );
        const receipt = await tx.wait();

        setIsLoading(false);
        return {
          transactionHash: receipt.hash,
          status: receipt.status === 1 ? "success" : "failed",
        };
      } catch (err) {
        console.error("Error creating repayment schedule:", err);
        setError(`Failed to create repayment schedule for loan ID ${loanId}`);
        setIsLoading(false);
        return null;
      }
    },
    [isConnected, lendSmartLoanContract],
  );

  // Cancel a loan request
  const cancelLoanRequest = useCallback(
    async (loanId) => {
      if (!isConnected) {
        setError("Please connect your wallet first");
        return null;
      }

      try {
        setIsLoading(true);
        setError(null);

        const tx = await lendSmartLoanContract.cancelLoanRequest(loanId);
        const receipt = await tx.wait();

        setIsLoading(false);
        return {
          transactionHash: receipt.hash,
          status: receipt.status === 1 ? "success" : "failed",
        };
      } catch (err) {
        console.error("Error cancelling loan request:", err);
        setError(`Failed to cancel loan request ID ${loanId}`);
        setIsLoading(false);
        return null;
      }
    },
    [isConnected, lendSmartLoanContract],
  );

  // Set loan risk score (only callable by risk assessor)
  const setLoanRiskScore = useCallback(
    async (loanId, riskScore, shouldReject = false) => {
      if (!isConnected) {
        setError("Please connect your wallet first");
        return null;
      }

      try {
        setIsLoading(true);
        setError(null);

        const tx = await lendSmartLoanContract.setLoanRiskScore(
          loanId,
          riskScore,
          shouldReject,
        );
        const receipt = await tx.wait();

        setIsLoading(false);
        return {
          transactionHash: receipt.hash,
          status: receipt.status === 1 ? "success" : "failed",
        };
      } catch (err) {
        console.error("Error setting loan risk score:", err);
        setError(`Failed to set risk score for loan ID ${loanId}`);
        setIsLoading(false);
        return null;
      }
    },
    [isConnected, lendSmartLoanContract],
  );

  // Mark a loan as defaulted (only callable by lender or owner)
  const markLoanAsDefaulted = useCallback(
    async (loanId) => {
      if (!isConnected) {
        setError("Please connect your wallet first");
        return null;
      }

      try {
        setIsLoading(true);
        setError(null);

        const tx = await lendSmartLoanContract.markLoanAsDefaulted(loanId);
        const receipt = await tx.wait();

        setIsLoading(false);
        return {
          transactionHash: receipt.hash,
          status: receipt.status === 1 ? "success" : "failed",
        };
      } catch (err) {
        console.error("Error marking loan as defaulted:", err);
        setError(`Failed to mark loan ID ${loanId} as defaulted`);
        setIsLoading(false);
        return null;
      }
    },
    [isConnected, lendSmartLoanContract],
  );

  // Get user reputation score
  const getUserReputationScore = useCallback(
    async (userAddress) => {
      if (!lendSmartLoanContract) {
        setError("Contract not initialized");
        return null;
      }

      try {
        setIsLoading(true);
        setError(null);

        const address = userAddress || account;
        if (!address) {
          setError("No address provided");
          setIsLoading(false);
          return null;
        }

        const score =
          await lendSmartLoanContract.getUserReputationScore(address);

        setIsLoading(false);
        return score.toString();
      } catch (err) {
        console.error("Error getting user reputation score:", err);
        setError(
          `Failed to get reputation score for user ${userAddress || account}`,
        );
        setIsLoading(false);
        return null;
      }
    },
    [lendSmartLoanContract, account],
  );

  // Context value. Memoized so functions passed to consumers (e.g. used as
  // useEffect dependencies) keep a stable reference across renders - without
  // this, an effect that depends on one of these functions re-fires on every
  // render, which can spiral into an infinite fetch loop.
  const value = useMemo(
    () => ({
      provider,
      signer,
      account,
      chainId,
      lendSmartLoanContract,
      isConnected,
      isLoading,
      isInitializing,
      error,
      connectWallet,
      disconnectWallet,
      requestLoan,
      getUserLoans,
      getLoanDetails,
      fundLoan,
      disburseLoan,
      repayLoan,
      depositCollateral,
      createRepaymentSchedule,
      cancelLoanRequest,
      setLoanRiskScore,
      markLoanAsDefaulted,
      getUserReputationScore,
    }),
    [
      provider,
      signer,
      account,
      chainId,
      lendSmartLoanContract,
      isConnected,
      isLoading,
      isInitializing,
      error,
      connectWallet,
      disconnectWallet,
      requestLoan,
      getUserLoans,
      getLoanDetails,
      fundLoan,
      disburseLoan,
      repayLoan,
      depositCollateral,
      createRepaymentSchedule,
      cancelLoanRequest,
      setLoanRiskScore,
      markLoanAsDefaulted,
      getUserReputationScore,
    ],
  );

  return (
    <BlockchainContext.Provider value={value}>
      {children}
    </BlockchainContext.Provider>
  );
};

export default BlockchainContext;
