// User Types
export interface User {
  id: string;
  email: string;
  name?: string;
  walletAddress?: string;
  role: "borrower" | "lender" | "both";
  reputation?: number;
  createdAt: string;
  updatedAt: string;
  emailVerified?: boolean;
  phoneNumber?: string;
  profileImage?: string;
}

// Auth Types
export interface AuthCredentials {
  email: string;
  password: string;
}

export interface RegisterData extends AuthCredentials {
  name: string;
  role?: "borrower" | "lender" | "both";
}

export interface AuthResponse {
  token: string;
  refreshToken?: string;
  expiresIn?: number;
  user: User;
}

// Loan Types
export enum LoanStatus {
  PENDING = "pending",
  APPROVED = "approved",
  FUNDED = "funded",
  ACTIVE = "active",
  REPAYING = "repaying",
  COMPLETED = "completed",
  DEFAULTED = "defaulted",
  REJECTED = "rejected",
}

export interface Loan {
  id: string;
  borrowerId: string;
  borrowerName?: string;
  borrowerReputation?: number;
  amount: number;
  fundedAmount?: number;
  remainingAmount?: number;
  interestRate: number;
  term: number; // months
  purpose: string;
  status: LoanStatus;
  creditScore?: number;
  aiRiskScore?: number;
  riskCategory?: "low" | "medium" | "high";
  collateral?: string;
  createdAt: string;
  fundedAt?: string;
  dueDate?: string;
  repaidAmount?: number;
  contractAddress?: string;
  transactionHash?: string;
  lenders?: Lender[];
}

export interface Lender {
  id: string;
  name?: string;
  amount: number;
  fundedAt: string;
}

export interface LoanApplicationData {
  amount: number;
  term: number;
  purpose: string;
  income?: number;
  employment?: string;
  collateral?: string;
}

export interface LoanFilters {
  minAmount?: number;
  maxAmount?: number;
  minInterestRate?: number;
  maxInterestRate?: number;
  riskCategory?: "low" | "medium" | "high";
  status?: LoanStatus;
  searchQuery?: string;
}

// Transaction Types
export interface Transaction {
  id: string;
  type:
    | "loan_funded"
    | "loan_repayment"
    | "loan_application"
    | "loan_disbursed";
  amount: number;
  loanId?: string;
  from?: string;
  to?: string;
  status: "pending" | "completed" | "failed";
  transactionHash?: string;
  createdAt: string;
  description?: string;
}

// Wallet Types
export interface WalletInfo {
  address: string;
  balance: string;
  isConnected: boolean;
  chainId?: number;
  networkName?: string;
}

// Dashboard Types
export interface DashboardSummary {
  activeLoans: number;
  totalBorrowed: number;
  totalLent: number;
  reputation: number;
  pendingApplications?: number;
  totalRepaid?: number;
  upcomingPayments?: number;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Navigation Types
export type RootStackParamList = {
  Auth: undefined;
  Main: undefined;
};

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ForgotPassword: undefined;
};

export type MainTabParamList = {
  Dashboard: undefined;
  Marketplace: undefined;
  Loans: undefined;
  Profile: undefined;
};

export type MarketplaceStackParamList = {
  MarketplaceList: undefined;
  LoanDetails: { loanId: string };
};

// Form Types
export interface LoginFormValues {
  email: string;
  password: string;
}

export interface RegisterFormValues {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface LoanApplicationFormValues {
  amount: number;
  term: number;
  purpose: string;
}

export interface ProfileUpdateFormValues {
  name?: string;
  phoneNumber?: string;
  profileImage?: string;
}

// Error Types
export interface AppError {
  message: string;
  code?: string;
  statusCode?: number;
  details?: any;
}

// Theme Types
export interface ThemeColors {
  primary: string;
  secondary: string;
  background: string;
  surface: string;
  error: string;
  success: string;
  warning: string;
  info: string;
  text: string;
  textSecondary: string;
  border: string;
  disabled: string;
  placeholder: string;
}

export interface Theme {
  dark: boolean;
  colors: ThemeColors;
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  borderRadius: {
    sm: number;
    md: number;
    lg: number;
  };
  fontSizes: {
    caption: number;
    body2: number;
    body1: number;
    h6: number;
    h5: number;
    h4: number;
    h3: number;
    h2: number;
    h1: number;
  };
  fonts: {
    primary: string;
    primaryMedium: string;
    primarySemiBold: string;
    primaryBold: string;
  };
}
