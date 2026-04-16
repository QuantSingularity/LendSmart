import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import PropTypes from "prop-types";
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import * as Keychain from "react-native-keychain";
import apiService from "../services/apiService";

export const AuthContext = createContext({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,
  login: async (_credentials) => {},
  logout: async () => {},
  register: async (_userData) => {},
  updateProfile: async (_userData) => {},
  resetPassword: async (_email) => {},
  verifyEmail: async (_code) => {},
  refreshToken: async () => {},
  clearError: () => {},
  checkAuthStatus: async () => {},
});

const AUTH_KEY = "userAuthData";
const TOKEN_EXPIRY_KEY = "tokenExpiry";
const REFRESH_TOKEN_KEY = "refreshToken";
const BIOMETRIC_ENABLED_KEY = "biometricEnabled";

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [refreshToken, setRefreshToken] = useState(null);
  const [tokenExpiry, setTokenExpiry] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [isConnected, setIsConnected] = useState(true);

  // Monitor network connectivity
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected);
      if (!state.isConnected) {
        console.log("Network connection lost");
      } else if (state.isConnected && !isConnected) {
        console.log("Network connection restored");
        checkAuthStatus(); // Verify token when connection is restored
      }
    });

    return () => unsubscribe();
  }, [isConnected, checkAuthStatus]);

  // Load auth data on initial app load
  useEffect(() => {
    const loadAuthData = async () => {
      try {
        setIsLoading(true);

        // Check if biometric auth is enabled
        const biometricEnabledStr = await AsyncStorage.getItem(
          BIOMETRIC_ENABLED_KEY,
        );
        const isBiometricEnabled = biometricEnabledStr === "true";
        setBiometricEnabled(isBiometricEnabled);

        // Get credentials from secure storage
        const credentials = await Keychain.getGenericPassword({
          service: AUTH_KEY,
        });

        if (credentials) {
          const storedData = JSON.parse(credentials.password);

          // Get token expiry and refresh token
          const expiryTimestamp = await AsyncStorage.getItem(TOKEN_EXPIRY_KEY);
          const storedRefreshToken =
            await AsyncStorage.getItem(REFRESH_TOKEN_KEY);

          setRefreshToken(storedRefreshToken);

          if (expiryTimestamp) {
            const expiry = parseInt(expiryTimestamp, 10);
            setTokenExpiry(expiry);

            // Check if token is expired
            const now = Date.now();
            if (now >= expiry) {
              // Token expired, try to refresh
              if (storedRefreshToken) {
                try {
                  await refreshTokenHandler(storedRefreshToken);
                } catch (refreshError) {
                  console.error("Failed to refresh token:", refreshError);
                  await clearAuthData();
                  setUser(null);
                  setToken(null);
                }
              } else {
                // No refresh token, clear auth data
                await clearAuthData();
                setUser(null);
                setToken(null);
              }
            } else {
              // Token still valid
              setToken(storedData.token);
              setUser(storedData.user);
              apiService.setAuthToken(storedData.token);

              // Schedule token refresh before expiry
              const timeToRefresh = expiry - now - 60000; // Refresh 1 minute before expiry
              if (timeToRefresh > 0) {
                setTimeout(() => {
                  refreshTokenHandler(storedRefreshToken);
                }, timeToRefresh);
              }
            }
          } else {
            // No expiry found, set token anyway but it might be invalid
            setToken(storedData.token);
            setUser(storedData.user);
            apiService.setAuthToken(storedData.token);

            // Verify token with backend
            verifyToken(storedData.token);
          }
        }
      } catch (err) {
        console.error("Failed to load auth data:", err);
        await clearAuthData();
      } finally {
        setIsLoading(false);
      }
    };

    loadAuthData();
  }, [
    clearAuthData,
    refreshTokenHandler, // Verify token with backend
    verifyToken,
  ]);

  // Verify token with backend
  const verifyToken = async (authToken) => {
    if (!authToken || !isConnected) return false;

    try {
      const _response = await apiService.get("/auth/verify");
      return true;
    } catch (err) {
      console.error("Token verification failed:", err);

      // If token is invalid, try to refresh
      if (refreshToken) {
        try {
          await refreshTokenHandler(refreshToken);
          return true;
        } catch (refreshError) {
          console.error(
            "Failed to refresh token during verification:",
            refreshError,
          );
          await clearAuthData();
          setUser(null);
          setToken(null);
          return false;
        }
      } else {
        await clearAuthData();
        setUser(null);
        setToken(null);
        return false;
      }
    }
  };

  // Store auth data securely
  const storeAuthData = async (
    newToken,
    userData,
    newRefreshToken,
    expiresIn,
  ) => {
    try {
      const dataToStore = JSON.stringify({ token: newToken, user: userData });
      await Keychain.setGenericPassword("user", dataToStore, {
        service: AUTH_KEY,
      });

      // Calculate and store token expiry
      const expiryTime = Date.now() + expiresIn * 1000;
      await AsyncStorage.setItem(TOKEN_EXPIRY_KEY, expiryTime.toString());
      setTokenExpiry(expiryTime);

      // Store refresh token
      if (newRefreshToken) {
        await AsyncStorage.setItem(REFRESH_TOKEN_KEY, newRefreshToken);
        setRefreshToken(newRefreshToken);
      }

      // Set token for API service
      apiService.setAuthToken(newToken);

      // Schedule token refresh before expiry
      if (expiresIn) {
        const timeToRefresh = expiresIn * 1000 - 60000; // Refresh 1 minute before expiry
        if (timeToRefresh > 0) {
          setTimeout(() => {
            refreshTokenHandler(newRefreshToken);
          }, timeToRefresh);
        }
      }
    } catch (err) {
      console.error("Failed to store auth data:", err);
      setError("Failed to save session data.");
    }
  };

  // Clear all auth data
  const clearAuthData = async () => {
    try {
      await Keychain.resetGenericPassword({ service: AUTH_KEY });
      await AsyncStorage.removeItem(TOKEN_EXPIRY_KEY);
      await AsyncStorage.removeItem(REFRESH_TOKEN_KEY);
      apiService.clearAuthToken();
    } catch (err) {
      console.error("Failed to clear auth data:", err);
    }
  };

  // Refresh token handler
  const refreshTokenHandler = async (currentRefreshToken) => {
    if (!currentRefreshToken || !isConnected) {
      throw new Error("No refresh token available or no network connection");
    }

    try {
      const response = await apiService.post("/auth/refresh", {
        refreshToken: currentRefreshToken,
      });
      const {
        token: newToken,
        refreshToken: newRefreshToken,
        expiresIn,
        user: userData,
      } = response.data;

      if (newToken) {
        setToken(newToken);

        if (userData) {
          setUser(userData);
        }

        await storeAuthData(
          newToken,
          userData || user,
          newRefreshToken,
          expiresIn,
        );
        return newToken;
      } else {
        throw new Error("Invalid refresh response");
      }
    } catch (err) {
      console.error("Token refresh failed:", err);
      await clearAuthData();
      setUser(null);
      setToken(null);
      setRefreshToken(null);
      throw err;
    }
  };

  // Login handler
  const login = useCallback(
    async (credentials, useBiometric = false) => {
      if (!isConnected) {
        setError(
          "No internet connection. Please check your network and try again.",
        );
        throw new Error("No internet connection");
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await apiService.post("/auth/login", credentials);
        const {
          token: newToken,
          refreshToken: newRefreshToken,
          expiresIn,
          user: userData,
        } = response.data;

        if (newToken && userData) {
          setToken(newToken);
          setUser(userData);

          // Store biometric preference if provided
          if (useBiometric !== undefined) {
            await AsyncStorage.setItem(
              BIOMETRIC_ENABLED_KEY,
              useBiometric.toString(),
            );
            setBiometricEnabled(useBiometric);
          }

          await storeAuthData(newToken, userData, newRefreshToken, expiresIn);
          return userData;
        } else {
          throw new Error("Invalid login response from server");
        }
      } catch (err) {
        console.error("Login failed:", err);
        const message =
          err.response?.data?.message ||
          err.message ||
          "Login failed. Please check your credentials.";
        setError(message);
        await clearAuthData();
        throw new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [isConnected, clearAuthData, storeAuthData],
  );

  // Logout handler
  const logout = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (isConnected && token) {
        // Attempt to notify backend about logout
        await apiService.post("/auth/logout");
      }
    } catch (err) {
      console.warn("Backend logout failed (continuing local logout):", err);
    } finally {
      setUser(null);
      setToken(null);
      setRefreshToken(null);
      await clearAuthData();
      setIsLoading(false);
    }
  }, [token, isConnected, clearAuthData]);

  // Register handler
  const register = useCallback(
    async (userData) => {
      if (!isConnected) {
        setError(
          "No internet connection. Please check your network and try again.",
        );
        throw new Error("No internet connection");
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await apiService.post("/auth/register", userData);
        return response.data;
      } catch (err) {
        console.error("Registration failed:", err);
        const message =
          err.response?.data?.message ||
          err.message ||
          "Registration failed. Please try again.";
        setError(message);
        throw new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [isConnected],
  );

  // Update profile handler
  const updateProfile = useCallback(
    async (userData) => {
      if (!isConnected) {
        setError(
          "No internet connection. Please check your network and try again.",
        );
        throw new Error("No internet connection");
      }

      if (!token) {
        setError("You must be logged in to update your profile.");
        throw new Error("Authentication required");
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await apiService.put("/users/profile", userData);
        const updatedUser = response.data;

        // Update local user data
        setUser((prevUser) => ({ ...prevUser, ...updatedUser }));

        // Update stored user data
        if (user && token) {
          await storeAuthData(
            token,
            { ...user, ...updatedUser },
            refreshToken,
            tokenExpiry
              ? Math.floor((tokenExpiry - Date.now()) / 1000)
              : undefined,
          );
        }

        return updatedUser;
      } catch (err) {
        console.error("Profile update failed:", err);
        const message =
          err.response?.data?.message ||
          err.message ||
          "Failed to update profile. Please try again.";
        setError(message);
        throw new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [token, user, refreshToken, tokenExpiry, isConnected, storeAuthData],
  );

  // Reset password handler
  const resetPassword = useCallback(
    async (email) => {
      if (!isConnected) {
        setError(
          "No internet connection. Please check your network and try again.",
        );
        throw new Error("No internet connection");
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await apiService.post("/auth/reset-password", {
          email,
        });
        return response.data;
      } catch (err) {
        console.error("Password reset request failed:", err);
        const message =
          err.response?.data?.message ||
          err.message ||
          "Failed to request password reset. Please try again.";
        setError(message);
        throw new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [isConnected],
  );

  // Verify email handler
  const verifyEmail = useCallback(
    async (code) => {
      if (!isConnected) {
        setError(
          "No internet connection. Please check your network and try again.",
        );
        throw new Error("No internet connection");
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await apiService.post("/auth/verify-email", { code });

        // If verification updates user data, update local state
        if (response.data.user) {
          setUser((prevUser) => ({ ...prevUser, ...response.data.user }));

          // Update stored user data
          if (user && token) {
            await storeAuthData(
              token,
              { ...user, ...response.data.user },
              refreshToken,
              tokenExpiry
                ? Math.floor((tokenExpiry - Date.now()) / 1000)
                : undefined,
            );
          }
        }

        return response.data;
      } catch (err) {
        console.error("Email verification failed:", err);
        const message =
          err.response?.data?.message ||
          err.message ||
          "Failed to verify email. Please try again.";
        setError(message);
        throw new Error(message);
      } finally {
        setIsLoading(false);
      }
    },
    [token, user, refreshToken, tokenExpiry, isConnected, storeAuthData],
  );

  // Refresh token (exposed for manual refresh)
  const refreshTokenManual = useCallback(async () => {
    if (!refreshToken) {
      setError("No refresh token available.");
      throw new Error("No refresh token available");
    }

    setIsLoading(true);
    setError(null);

    try {
      const newToken = await refreshTokenHandler(refreshToken);
      return newToken;
    } catch (_err) {
      const message = "Failed to refresh authentication. Please log in again.";
      setError(message);
      throw new Error(message);
    } finally {
      setIsLoading(false);
    }
  }, [refreshToken, refreshTokenHandler]);

  // Clear error state
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Check authentication status
  const checkAuthStatus = useCallback(async () => {
    if (!token || !isConnected) return false;

    setIsLoading(true);
    try {
      const isValid = await verifyToken(token);
      return isValid;
    } catch (err) {
      console.error("Auth status check failed:", err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [token, isConnected, verifyToken]);

  // Toggle biometric authentication
  const toggleBiometric = useCallback(async (enabled) => {
    try {
      await AsyncStorage.setItem(BIOMETRIC_ENABLED_KEY, enabled.toString());
      setBiometricEnabled(enabled);
      return true;
    } catch (err) {
      console.error("Failed to toggle biometric authentication:", err);
      return false;
    }
  }, []);

  // Context value with memoization for performance
  const authContextValue = useMemo(
    () => ({
      user,
      token,
      isAuthenticated: !!token && !!user,
      isLoading,
      error,
      biometricEnabled,
      isConnected,
      login,
      logout,
      register,
      updateProfile,
      resetPassword,
      verifyEmail,
      refreshToken: refreshTokenManual,
      clearError,
      checkAuthStatus,
      toggleBiometric,
    }),
    [
      user,
      token,
      isLoading,
      error,
      biometricEnabled,
      isConnected,
      login,
      logout,
      register,
      updateProfile,
      resetPassword,
      verifyEmail,
      refreshTokenManual,
      clearError,
      checkAuthStatus,
      toggleBiometric,
    ],
  );

  return (
    <AuthContext.Provider value={authContextValue}>
      {children}
    </AuthContext.Provider>
  );
};

// PropTypes validation
AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export default AuthProvider;
