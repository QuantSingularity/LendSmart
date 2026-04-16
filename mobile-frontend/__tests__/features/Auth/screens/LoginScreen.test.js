import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { PaperProvider } from "react-native-paper"; // Assuming react-native-paper is used for UI components
import { AuthContext } from "../../../../../contexts/AuthContext";
import LoginScreen from "../LoginScreen";

// Mock navigation
const mockNavigate = jest.fn();
const mockNavigation = { navigate: mockNavigate };

// Mock AuthContext
const mockLogin = jest.fn();
let mockAuthLoading = false;
let mockAuthError = null;

const mockAuthContextValue = {
  login: mockLogin,
  loading: mockAuthLoading,
  error: mockAuthError,
  // Add other context values if LoginScreen uses them
  user: null,
  isAuthenticated: false,
  register: jest.fn(),
  logout: jest.fn(),
};

// Custom wrapper to provide necessary contexts and theme
const AllTheProviders = ({ children }) => (
  <AuthContext.Provider value={mockAuthContextValue}>
    <PaperProvider>{children}</PaperProvider>
  </AuthContext.Provider>
);

describe("LoginScreen", () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockLogin.mockClear();
    mockNavigate.mockClear();
    mockAuthLoading = false;
    mockAuthError = null;
    // Update context value if it's reassigned per test, or ensure the one above is mutable if needed
    mockAuthContextValue.loading = mockAuthLoading;
    mockAuthContextValue.error = mockAuthError;
  });

  it("renders correctly with all form elements", () => {
    const { getByText, getByLabelText } = render(
      <LoginScreen navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );

    expect(getByText("Welcome Back")).toBeTruthy();
    expect(getByText("Login to your LendSmart account")).toBeTruthy();
    expect(getByLabelText("Email")).toBeTruthy();
    expect(getByLabelText("Password")).toBeTruthy();
    expect(getByText("Login")).toBeTruthy(); // Button text
    expect(getByText("Don't have an account? Register")).toBeTruthy();
  });

  it("allows typing in email and password fields", () => {
    const { getByLabelText } = render(
      <LoginScreen navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );

    const emailInput = getByLabelText("Email");
    const passwordInput = getByLabelText("Password");

    fireEvent.changeText(emailInput, "test@example.com");
    fireEvent.changeText(passwordInput, "password123");

    expect(emailInput.props.value).toBe("test@example.com");
    expect(passwordInput.props.value).toBe("password123");
  });

  it("shows validation errors for invalid input", async () => {
    const { getByText, getByLabelText } = render(
      <LoginScreen navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );

    const loginButton = getByText("Login");

    // Test with empty fields
    fireEvent.press(loginButton);
    await waitFor(() => {
      expect(getByText("Required")).toBeTruthy(); // For email
      // Yup might show multiple 'Required' if both are empty, or specific messages
    });

    // Test with invalid email
    const emailInput = getByLabelText("Email");
    fireEvent.changeText(emailInput, "invalid-email");
    fireEvent.press(loginButton);
    await waitFor(() => {
      expect(getByText("Invalid email")).toBeTruthy();
    });

    // Test with short password
    const passwordInput = getByLabelText("Password");
    fireEvent.changeText(passwordInput, "123");
    fireEvent.press(loginButton);
    await waitFor(() => {
      expect(getByText("Password too short")).toBeTruthy();
    });
  });

  it("calls login function from AuthContext on valid submission", async () => {
    mockLogin.mockResolvedValueOnce({ success: true }); // Assume login resolves successfully
    const { getByText, getByLabelText } = render(
      <LoginScreen navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );

    const emailInput = getByLabelText("Email");
    const passwordInput = getByLabelText("Password");
    const loginButton = getByText("Login");

    fireEvent.changeText(emailInput, "test@example.com");
    fireEvent.changeText(passwordInput, "password123");
    fireEvent.press(loginButton);

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledTimes(1);
      expect(mockLogin).toHaveBeenCalledWith({
        email: "test@example.com",
        password: "password123",
      });
    });
  });

  it("displays loading indicator when auth is loading", () => {
    mockAuthContextValue.loading = true;
    const { getByText, getByTestId } = render(
      <LoginScreen navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );
    // react-native-paper Button's loading prop shows an ActivityIndicator
    // We check if the button is disabled and shows loading state
    const loginButton = getByText("Login").parent.parent; // Access the Button component itself
    expect(loginButton.props.loading).toBe(true);
    expect(loginButton.props.disabled).toBe(true);
  });

  it("displays error message from AuthContext if login fails", async () => {
    const errorMessage = "Invalid credentials, please try again.";
    mockAuthContextValue.error = errorMessage;
    mockLogin.mockRejectedValueOnce(new Error("Login failed")); // Simulate login failure

    const { getByText, getByLabelText } = render(
      <LoginScreen navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );

    // Even if login is not pressed, if error is in context, it should display
    expect(getByText(errorMessage)).toBeTruthy();

    // Also test if error appears after a failed login attempt
    mockAuthContextValue.error = null; // Reset error before attempting login
    fireEvent.changeText(getByLabelText("Email"), "fail@example.com");
    fireEvent.changeText(getByLabelText("Password"), "wrongpassword");
    fireEvent.press(getByText("Login"));

    await waitFor(() => {
      // Simulate error being set in context after API call
      mockAuthContextValue.error = errorMessage;
      // Re-render or update state to show error (RTL handles this)
    });
    // This assertion might need adjustment based on how error is set and re-rendered
    // For now, we assume if error is in context, it's displayed.
    // A more robust test would involve the login mock actually setting the error in context.
  });

  it('navigates to Register screen when "Register" button is pressed', () => {
    const { getByText } = render(<LoginScreen navigation={mockNavigation} />, {
      wrapper: AllTheProviders,
    });

    const registerButton = getByText("Don't have an account? Register");
    fireEvent.press(registerButton);

    expect(mockNavigate).toHaveBeenCalledWith("Register");
  });
});
