import { Platform } from "react-native";

// API Configuration
export const API_CONFIG = {
  baseURL:
    Platform.OS === "ios"
      ? process.env.MOBILE_API_BASE_URL_IOS || "http://localhost:5000/api"
      : process.env.MOBILE_API_BASE_URL_ANDROID || "http://10.0.2.2:5000/api",
  timeout: 10000, // 10 seconds
};

// Blockchain Configuration
export const BLOCKCHAIN_CONFIG = {
  rpcUrl:
    Platform.OS === "ios" ? "http://localhost:8545" : "http://10.0.2.2:8545", // Local dev network
  testnetRpcUrl:
    process.env.MOBILE_TESTNET_RPC_URL ||
    "https://sepolia.infura.io/v3/YOUR_INFURA_PROJECT_ID",
  contractAddress: process.env.MOBILE_LOAN_CONTRACT_ADDRESS || "",
  networkId: 1337, // Local network ID (Hardhat default)
  testnetNetworkId: 11155111, // Sepolia testnet
};

// WalletConnect Configuration
export const WALLETCONNECT_CONFIG = {
  projectId:
    process.env.WALLETCONNECT_PROJECT_ID || "YOUR_WALLETCONNECT_PROJECT_ID",
  providerMetadata: {
    name: "LendSmart Mobile",
    description: "LendSmart Mobile - P2P Lending Platform",
    url: "https://lendsmart.example.com/",
    icons: ["https://lendsmart.example.com/logo.png"],
    redirect: {
      native: "lendsmart://",
      universal: "https://lendsmart.example.com",
    },
  },
};

// App Configuration
export const APP_CONFIG = {
  name: "LendSmart Mobile",
  version: "0.0.1",
  environment: __DEV__ ? "development" : "production",
};

// Loan Application Limits
export const LOAN_LIMITS = {
  minAmount: 100,
  maxAmount: 10000,
  minTerm: 1, // months
  maxTerm: 36, // months
  minPurposeLength: 10,
  maxPurposeLength: 200,
};

// Storage Keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: "authToken",
  USER_DATA: "userData",
  THEME_MODE: "themeMode",
  BIOMETRIC_ENABLED: "biometricEnabled",
  WALLET_ADDRESS: "walletAddress",
};

export default {
  API_CONFIG,
  BLOCKCHAIN_CONFIG,
  WALLETCONNECT_CONFIG,
  APP_CONFIG,
  LOAN_LIMITS,
  STORAGE_KEYS,
};
