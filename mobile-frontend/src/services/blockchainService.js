import { ethers } from "ethers";
import { Platform } from "react-native";
// It_s generally not recommended to store private keys directly in mobile app storage for mainnet.
// For development or testnets, or if using a wallet SDK that manages keys, this might differ.

// Assuming ABIs and addresses are bundled or managed similarly to the web version
import LoanContractABI from "../contracts/LoanContract.json";
import ContractAddress from "../contracts/LoanContract-address.json";

// For mobile, direct RPC URLs might be used for read-only, but transactions need a wallet.
// Integration with mobile wallets (MetaMask mobile, Trust Wallet, etc.) is typically done via WalletConnect or deeplinking.
// The `ethers` BrowserProvider used in web relies on `window.ethereum` which isn_t standard in React Native.
// For a full-fledged dApp, you_d use a library like @web3modal/ethers5 (for ethers v5) or @web3modal/wagmi (for wagmi/viem)
// or directly implement WalletConnect SDK.

// This is a SIMPLIFIED example assuming a private key is available for development/testing or a specific setup.
// ** THIS IS NOT SECURE FOR PRODUCTION MAINNET USE WITH USER PRIVATE KEYS. **
// ** FOR PRODUCTION, INTEGRATE WITH A MOBILE WALLET SDK (e.g., WalletConnect, MetaMask SDK). **

let provider;
let signer; // This would be a Wallet instance if using a private key directly, or from a wallet SDK
let loanContract;
let loanContractReadOnly;

const LOCAL_RPC_URL_IOS = "http://localhost:8545"; // For local Hardhat/Ganache node when running on iOS simulator
const LOCAL_RPC_URL_ANDROID = "http://10.0.2.2:8545"; // For local Hardhat/Ganache node when running on Android emulator
const SELECTED_RPC_URL =
  Platform.OS === "ios" ? LOCAL_RPC_URL_IOS : LOCAL_RPC_URL_ANDROID;

// Fallback to a public testnet RPC if no local dev key is set
const DEFAULT_TESTNET_RPC =
  process.env.MOBILE_TESTNET_RPC_URL ||
  "https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID"; // Replace with your Sepolia RPC
const CONTRACT_ADDRESS =
  process.env.MOBILE_LOAN_CONTRACT_ADDRESS || ContractAddress.address;

/**
 * Initializes the blockchain service for mobile.
 * This is a simplified version. Production apps need robust wallet integration.
 * @returns {Promise<boolean>} True if initialization is successful.
 */
export const initMobileBlockchainService = async (devPrivateKey = null) => {
  try {
    let currentProviderUrl = SELECTED_RPC_URL;
    if (devPrivateKey) {
      provider = new ethers.JsonRpcProvider(currentProviderUrl);
      signer = new ethers.Wallet(devPrivateKey, provider);
      console.log(
        "Mobile blockchain service initialized with development signer (private key).",
      );
    } else {
      // Read-only provider if no private key (or for public data fetching)
      // For actual transactions, a wallet connection (e.g. WalletConnect) would be needed here.
      console.warn(
        "Initializing mobile blockchain service in read-only mode or awaiting WalletConnect.",
      );
      console.warn("To perform transactions, integrate a mobile wallet SDK.");
      currentProviderUrl = DEFAULT_TESTNET_RPC.includes(
        "YOUR_INFURA_PROJECT_ID",
      )
        ? SELECTED_RPC_URL
        : DEFAULT_TESTNET_RPC;
      provider = new ethers.JsonRpcProvider(currentProviderUrl);
      signer = null; // No signer for read-only or if wallet not connected
    }

    const network = await provider.getNetwork();
    console.log(
      `Connected to network: ${network.name} (Chain ID: ${network.chainId}) via ${currentProviderUrl}`,
    );

    if (!CONTRACT_ADDRESS || CONTRACT_ADDRESS === "") {
      console.error(
        "LoanContract address is not configured for mobile. Check env or src/contracts/LoanContract-address.json",
      );
      // Alert.alert("Error", "Smart contract address not found.");
      return false;
    }

    if (signer) {
      loanContract = new ethers.Contract(
        CONTRACT_ADDRESS,
        LoanContractABI.abi,
        signer,
      );
    }
    loanContractReadOnly = new ethers.Contract(
      CONTRACT_ADDRESS,
      LoanContractABI.abi,
      provider,
    );

    console.log(
      "Mobile LoanContract instance created. Address:",
      CONTRACT_ADDRESS,
    );
    if (signer) console.log("Signer address:", await signer.getAddress());
    return true;
  } catch (error) {
    console.error("Error initializing mobile blockchain service:", error);
    // Alert.alert("Blockchain Error", "Could not connect to the blockchain network.");
    return false;
  }
};

// Call this function early in your app, perhaps with a dev private key from a secure config for dev builds.
// e.g., initMobileBlockchainService(process.env.DEV_PRIVATE_KEY_MOBILE);

/**
 * Gets the current connected account address (if using dev private key).
 * @returns {Promise<string|null>} The account address or null.
 */
export const getConnectedAccount = async () => {
  return signer ? await signer.getAddress() : null;
};

// --- LoanContract Interaction Functions (Simplified for Mobile) ---
// These functions assume `signer` is available (e.g., from a dev private key or WalletConnect session)
// For ERC20 approvals, the token contract instance would also be needed.

const getSignerOrThrow = () => {
  if (!signer)
    throw new Error(
      "Signer not available. Connect wallet or provide private key for development.",
    );
  if (!loanContract)
    throw new Error(
      "LoanContract instance not available. Initialize service first.",
    );
  return loanContract; // Returns the contract instance bound to the signer
};

export const requestLoanOnChain = async (
  tokenAddress,
  principal,
  interestRate,
  duration,
  purpose,
) => {
  const contract = getSignerOrThrow();
  try {
    const principalAmount = ethers.parseUnits(principal.toString(), 18); // Assuming 18 decimals
    const tx = await contract.requestLoan(
      tokenAddress,
      principalAmount,
      interestRate,
      duration,
      purpose,
    );
    // Mobile: May want to show transaction progress to user
    // const receipt = await tx.wait();
    // return receipt;
    return tx;
  } catch (error) {
    console.error("Mobile: Error requesting loan on chain:", error);
    throw error;
  }
};

export const fundLoanOnChain = async (loanId, tokenAddress, amountToFund) => {
  const contract = getSignerOrThrow();
  try {
    // ERC20 Approve step (simplified - assumes generic ERC20 ABI is part of LoanContractABI or separate)
    const tokenContract = new ethers.Contract(
      tokenAddress,
      LoanContractABI.abi_erc20,
      signer,
    );
    const amount = ethers.parseUnits(amountToFund.toString(), 18);
    const approveTx = await tokenContract.approve(CONTRACT_ADDRESS, amount);
    await approveTx.wait();
    console.log("Mobile: Token approval successful for funding.");

    const tx = await contract.fundLoan(loanId);
    return tx;
  } catch (error) {
    console.error("Mobile: Error funding loan on chain:", error);
    throw error;
  }
};

export const repayLoanOnChain = async (loanId, tokenAddress, amountToRepay) => {
  const contract = getSignerOrThrow();
  try {
    const tokenContract = new ethers.Contract(
      tokenAddress,
      LoanContractABI.abi_erc20,
      signer,
    );
    const amount = ethers.parseUnits(amountToRepay.toString(), 18);
    const approveTx = await tokenContract.approve(CONTRACT_ADDRESS, amount);
    await approveTx.wait();
    console.log("Mobile: Token approval successful for repayment.");

    const tx = await contract.repayLoan(loanId, amount);
    return tx;
  } catch (error) {
    console.error("Mobile: Error repaying loan on chain:", error);
    throw error;
  }
};

export const getLoanDetailsFromChain = async (loanId) => {
  if (!loanContractReadOnly)
    throw new Error("Read-only contract instance not available.");
  try {
    const loanDetails = await loanContractReadOnly.getLoanDetails(loanId);
    return {
      id: loanDetails.id.toString(),
      borrower: loanDetails.borrower,
      lender: loanDetails.lender,
      token: loanDetails.token,
      principal: ethers.formatUnits(loanDetails.principal, 18),
      interestRate: loanDetails.interestRate.toString(),
      duration: loanDetails.duration.toString(),
      requestedTime: loanDetails.requestedTime.toString(),
      fundedTime: loanDetails.fundedTime.toString(),
      repaymentAmount: ethers.formatUnits(loanDetails.repaymentAmount, 18),
      amountRepaid: ethers.formatUnits(loanDetails.amountRepaid, 18),
      status: Number(loanDetails.status), // Enum will be a number, map to string in UI
      purpose: loanDetails.purpose,
    };
  } catch (error) {
    console.error(
      `Mobile: Error fetching loan details for ID ${loanId} from chain:`,
      error,
    );
    throw error;
  }
};

export const getUserLoansFromChain = async (userAddress) => {
  if (!loanContractReadOnly)
    throw new Error("Read-only contract instance not available.");
  try {
    const loanIdsBigInt = await loanContractReadOnly.getUserLoans(userAddress);
    return loanIdsBigInt.map((id) => id.toString());
  } catch (error) {
    console.error(
      `Mobile: Error fetching loans for user ${userAddress} from chain:`,
      error,
    );
    throw error;
  }
};

// Placeholder for ERC20 ABI fragment (same as web version)
if (LoanContractABI && !LoanContractABI.abi_erc20) {
  LoanContractABI.abi_erc20 = [
    {
      constant: false,
      inputs: [
        { name: "_spender", type: "address" },
        { name: "_value", type: "uint256" },
      ],
      name: "approve",
      outputs: [{ name: "", type: "bool" }],
      payable: false,
      stateMutability: "nonpayable",
      type: "function",
    },
    {
      constant: true,
      inputs: [
        { name: "_owner", type: "address" },
        { name: "_spender", type: "address" },
      ],
      name: "allowance",
      outputs: [{ name: "", type: "uint256" }],
      payable: false,
      stateMutability: "view",
      type: "function",
    },
  ];
}

// It_s crucial to call initMobileBlockchainService() at an appropriate point in your app_s lifecycle,
// for example, in your main App.js or a context provider.
// For development, you might pass a hardcoded private key (NOT FOR PRODUCTION).
// Example: initMobileBlockchainService("YOUR_DEVELOPMENT_PRIVATE_KEY");
