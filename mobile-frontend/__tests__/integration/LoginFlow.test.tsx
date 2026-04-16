import { fireEvent, render, waitFor } from "@testing-library/react-native";
import type React from "react";
import { Provider as PaperProvider } from "react-native-paper";
import { AuthProvider } from "../../src/contexts/AuthContext";
import { ThemeProvider } from "../../src/contexts/ThemeContext";
import LoginScreen from "../../src/features/Auth/screens/LoginScreen";
import * as apiService from "../../src/services/apiService";

// Mock navigation
const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  reset: jest.fn(),
};

// Mock API service
jest.mock("../../src/services/apiService");

const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  return (
    <AuthProvider>
      <ThemeProvider>
        <PaperProvider>{children}</PaperProvider>
      </ThemeProvider>
    </AuthProvider>
  );
};

describe("Login Flow Integration Test", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should successfully log in with valid credentials", async () => {
    // Mock successful API response
    const mockUser = {
      id: "1",
      email: "test@example.com",
      name: "Test User",
    };

    (apiService.default.post as jest.Mock).mockResolvedValueOnce({
      data: {
        token: "mock-token",
        user: mockUser,
        expiresIn: 3600,
      },
    });

    const { getByLabelText, getByText } = render(
      <LoginScreen navigation={mockNavigation as any} />,
      { wrapper: AllTheProviders },
    );

    // Fill in the form
    const emailInput = getByLabelText("Email");
    const passwordInput = getByLabelText("Password");
    const loginButton = getByText("Login");

    fireEvent.changeText(emailInput, "test@example.com");
    fireEvent.changeText(passwordInput, "password123");
    fireEvent.press(loginButton);

    // Wait for the API call to complete
    await waitFor(() => {
      expect(apiService.default.post).toHaveBeenCalledWith(
        "/auth/login",
        expect.objectContaining({
          email: "test@example.com",
          password: "password123",
        }),
      );
    });
  });

  it("should show error message with invalid credentials", async () => {
    // Mock failed API response
    (apiService.default.post as jest.Mock).mockRejectedValueOnce({
      response: {
        data: { message: "Invalid credentials" },
      },
    });

    const { getByLabelText, getByText, findByText } = render(
      <LoginScreen navigation={mockNavigation as any} />,
      { wrapper: AllTheProviders },
    );

    // Fill in the form with invalid credentials
    const emailInput = getByLabelText("Email");
    const passwordInput = getByLabelText("Password");
    const loginButton = getByText("Login");

    fireEvent.changeText(emailInput, "wrong@example.com");
    fireEvent.changeText(passwordInput, "wrongpassword");
    fireEvent.press(loginButton);

    // Wait for error message
    const errorMessage = await findByText(/Invalid credentials|Login failed/i);
    expect(errorMessage).toBeTruthy();
  });

  it("should validate form fields", async () => {
    const { getByLabelText, getByText, findByText } = render(
      <LoginScreen navigation={mockNavigation as any} />,
      { wrapper: AllTheProviders },
    );

    const loginButton = getByText("Login");

    // Try to submit without filling in fields
    fireEvent.press(loginButton);

    // Should show validation errors
    const emailError = await findByText(/Required|Invalid email/i);
    expect(emailError).toBeTruthy();
  });

  it("should navigate to register screen", () => {
    const { getByText } = render(
      <LoginScreen navigation={mockNavigation as any} />,
      { wrapper: AllTheProviders },
    );

    const registerButton = getByText(/Don't have an account/i);
    fireEvent.press(registerButton);

    expect(mockNavigation.navigate).toHaveBeenCalledWith("Register");
  });
});
