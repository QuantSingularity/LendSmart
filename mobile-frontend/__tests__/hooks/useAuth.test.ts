import { renderHook } from "@testing-library/react";
import React from "react";
import { AuthContext } from "../../src/contexts/AuthContext";
import { useAuth } from "../../src/hooks/useAuth";

const mockAuthContext = {
  user: { id: "1", email: "test@example.com", name: "Test User" },
  token: "mock-token",
  isAuthenticated: true,
  isLoading: false,
  error: null,
  biometricEnabled: false,
  isConnected: true,
  login: jest.fn(),
  logout: jest.fn(),
  register: jest.fn(),
  updateProfile: jest.fn(),
  resetPassword: jest.fn(),
  verifyEmail: jest.fn(),
  refreshToken: jest.fn(),
  clearError: jest.fn(),
  checkAuthStatus: jest.fn(),
  toggleBiometric: jest.fn(),
};

// Wrapper component to provide the context (no JSX)
const wrapper: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  React.createElement(
    AuthContext.Provider,
    { value: mockAuthContext },
    children,
  );

describe("useAuth Hook", () => {
  it("should return auth context when used inside AuthProvider", () => {
    // Pass the wrapper to renderHook
    const { result } = renderHook(() => useAuth(), { wrapper });

    expect(result.current.user).toEqual(mockAuthContext.user);
    expect(result.current.token).toEqual(mockAuthContext.token);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.login).toBe(mockAuthContext.login);
    expect(result.current.isLoading).toBe(mockAuthContext.isLoading);
  });

  it("should throw error when used outside AuthProvider", () => {
    // Suppress console.error output caused by React's error boundaries when an error is thrown during render
    const originalError = console.error;
    console.error = jest.fn();

    // The function that calls renderHook must be wrapped in expect().toThrow()
    expect(() => {
      // Calling renderHook without a wrapper, which simulates using the hook outside the provider
      renderHook(() => useAuth());
    }).toThrow("useAuth must be used within an AuthProvider"); // Adjust message if your hook throws a different text

    // Restore the original console.error function
    console.error = originalError;
  });
});
