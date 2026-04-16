import AsyncStorage from "@react-native-async-storage/async-storage"; // For storing auth token
import axios from "axios";
import { Platform } from "react-native";

// Determine base URL based on platform for development
// For Android emulator, localhost is 10.0.2.2
// For iOS simulator, localhost is localhost
// For production, use your actual deployed backend URL
const API_BASE_URL_IOS =
  process.env.MOBILE_API_BASE_URL_IOS || "http://localhost:5000/api";
const API_BASE_URL_ANDROID =
  process.env.MOBILE_API_BASE_URL_ANDROID || "http://10.0.2.2:5000/api";

const API_BASE_URL =
  Platform.OS === "ios" ? API_BASE_URL_IOS : API_BASE_URL_ANDROID;

// Create an Axios instance
const mobileApiService = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
  timeout: 10000, // 10 seconds timeout
});

// Interceptor to add JWT token to requests if available
mobileApiService.interceptors.request.use(
  async (config) => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (e) {
      console.error("Error reading authToken from AsyncStorage:", e);
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Interceptor to handle responses (e.g., for global error handling or token refresh)
mobileApiService.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    if (error.response) {
      console.error("Mobile API Error Response:", error.response.data);
      console.error("Status:", error.response.status);

      if (error.response.status === 401) {
        console.warn(
          "Unauthorized access - 401. Clearing token and navigating to login.",
        );
        try {
          await AsyncStorage.removeItem("authToken");
          // Navigation to login screen should be handled by the app_s navigation logic,
          // possibly by listening to an event or checking auth state in a global context.
          // Example: RootNavigation.navigate("LoginScreen"); (if you have such a helper)
        } catch (e) {
          console.error("Error removing authToken from AsyncStorage:", e);
        }
      }
    } else if (error.request) {
      console.error("Mobile API No Response:", error.request);
      // alert("Network error: Could not connect to the server. Please check your internet connection.");
    } else {
      console.error("Mobile API Request Setup Error:", error.message);
    }
    return Promise.reject(error.response ? error.response.data : error);
  },
);

// --- Auth Service Calls ---
export const registerUser = (userData) =>
  mobileApiService.post("/auth/register", userData);
export const loginUser = (credentials) =>
  mobileApiService.post("/auth/login", credentials);
export const getUserProfile = () => mobileApiService.get("/auth/me");
export const updateUserProfile = (profileData) =>
  mobileApiService.put("/auth/profile", profileData);

// --- Loan Service Calls ---
export const applyLoan = (loanData) =>
  mobileApiService.post("/loans/apply", loanData);
export const getMarketplaceLoans = (params) =>
  mobileApiService.get("/loans", { params });
export const getMyLoans = (params) =>
  mobileApiService.get("/loans/my-loans", { params });
export const getLoanDetails = (loanId) =>
  mobileApiService.get(`/loans/${loanId}`);
export const fundLoan = (loanId, fundingData) =>
  mobileApiService.post(`/loans/${loanId}/fund`, fundingData);
export const recordRepayment = (loanId, repaymentData) =>
  mobileApiService.post(`/loans/${loanId}/repay`, repaymentData);

// --- Helper Methods ---
// Set auth token (used by AuthContext)
mobileApiService.setAuthToken = (token) => {
  if (token) {
    mobileApiService.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete mobileApiService.defaults.headers.common.Authorization;
  }
};

// Clear auth token
mobileApiService.clearAuthToken = () => {
  delete mobileApiService.defaults.headers.common.Authorization;
};

// Generic HTTP methods for direct use
mobileApiService.get = (url, config) => mobileApiService.get(url, config);
mobileApiService.post = (url, data, config) =>
  mobileApiService.post(url, data, config);
mobileApiService.put = (url, data, config) =>
  mobileApiService.put(url, data, config);
mobileApiService.delete = (url, config) => mobileApiService.delete(url, config);

export default mobileApiService;
