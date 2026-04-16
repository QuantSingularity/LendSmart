import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { Alert } from "react-native";
import { PaperProvider } from "react-native-paper";
import { AuthContext } from "../../../../../contexts/AuthContext";
import RegisterScreen from "../RegisterScreen";

// Mock navigation
const mockNavigate = jest.fn();
const mockNavigation = { navigate: mockNavigate };

// Mock AuthContext
const mockRegister = jest.fn();
let mockAuthLoading = false;
let mockAuthError = null;

const mockAuthContextValue = {
  register: mockRegister,
  loading: mockAuthLoading,
  error: mockAuthError,
  // Add other context values if RegisterScreen uses them
  user: null,
  isAuthenticated: false,
  login: jest.fn(),
  logout: jest.fn(),
};

// Mock Alert
jest.spyOn(Alert, "alert");

// Custom wrapper to provide necessary contexts and theme
const AllTheProviders = ({ children }) => (
  <AuthContext.Provider value={mockAuthContextValue}>
    <PaperProvider>{children}</PaperProvider>
  </AuthContext.Provider>
);

describe("RegisterScreen", () => {
  beforeEach(() => {
    // Reset mocks before each test
    mockRegister.mockClear();
    mockNavigate.mockClear();
    Alert.alert.mockClear();
    mockAuthLoading = false;
    mockAuthError = null;
    mockAuthContextValue.loading = mockAuthLoading;
    mockAuthContextValue.error = mockAuthError;
  });

  it("renders correctly with all form elements", () => {
    const { getByText, getByLabelText } = render(
      <RegisterScreen navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );

    expect(getByText("Create Account")).toBeTruthy();
    expect(getByText("Join LendSmart today!")).toBeTruthy();
    expect(getByLabelText("Full Name")).toBeTruthy();
    expect(getByLabelText("Email")).toBeTruthy();
    expect(getByLabelText("Password")).toBeTruthy();
    expect(getByLabelText("Confirm Password")).toBeTruthy();
    expect(getByText("Register")).toBeTruthy(); // Button text
    expect(getByText("Already have an account? Login")).toBeTruthy();
  });

  it("allows typing in form fields", () => {
    const { getByLabelText } = render(
      <RegisterScreen navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );

    fireEvent.changeText(getByLabelText("Full Name"), "Test User");
    fireEvent.changeText(getByLabelText("Email"), "test@example.com");
    fireEvent.changeText(getByLabelText("Password"), "Password123");
    fireEvent.changeText(getByLabelText("Confirm Password"), "Password123");

    expect(getByLabelText("Full Name").props.value).toBe("Test User");
    expect(getByLabelText("Email").props.value).toBe("test@example.com");
    expect(getByLabelText("Password").props.value).toBe("Password123");
    expect(getByLabelText("Confirm Password").props.value).toBe("Password123");
  });

  it("shows validation errors for invalid input", async () => {
    const { getByText, getByLabelText } = render(
      <RegisterScreen navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );
    const registerButton = getByText("Register");

    // Test with empty fields
    fireEvent.press(registerButton);
    await waitFor(() => {
      expect(getByText("Name is required")).toBeTruthy();
      expect(getByText("Email is required")).toBeTruthy();
      expect(getByText("Password is required")).toBeTruthy();
      expect(getByText("Confirm password is required")).toBeTruthy();
    });

    // Test with invalid email
    fireEvent.changeText(getByLabelText("Email"), "invalid-email");
    fireEvent.press(registerButton);
    await waitFor(() => expect(getByText("Invalid email")).toBeTruthy());

    // Test with short password
    fireEvent.changeText(getByLabelText("Password"), "short");
    fireEvent.press(registerButton);
    await waitFor(() =>
      expect(getByText("Password must be at least 8 characters")).toBeTruthy(),
    );

    // Test password complexity (missing uppercase)
    fireEvent.changeText(getByLabelText("Password"), "password123");
    fireEvent.press(registerButton);
    await waitFor(() =>
      expect(
        getByText("Password must contain at least one uppercase letter"),
      ).toBeTruthy(),
    );

    // Test password mismatch
    fireEvent.changeText(getByLabelText("Password"), "Password123");
    fireEvent.changeText(
      getByLabelText("Confirm Password"),
      "PasswordMismatch",
    );
    fireEvent.press(registerButton);
    await waitFor(() => expect(getByText("Passwords must match")).toBeTruthy());
  });

  it("calls register function from AuthContext on valid submission and shows success alert", async () => {
    mockRegister.mockResolvedValueOnce({ success: true }); // Assume register resolves successfully
    const { getByText, getByLabelText } = render(
      <RegisterScreen navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );

    fireEvent.changeText(getByLabelText("Full Name"), "Test User");
    fireEvent.changeText(getByLabelText("Email"), "test@example.com");
    fireEvent.changeText(getByLabelText("Password"), "Password123");
    fireEvent.changeText(getByLabelText("Confirm Password"), "Password123");
    fireEvent.press(getByText("Register"));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledTimes(1);
      expect(mockRegister).toHaveBeenCalledWith({
        name: "Test User",
        email: "test@example.com",
        password: "Password123",
      });
      expect(Alert.alert).toHaveBeenCalledWith(
        "Registration Successful",
        "You can now log in with your credentials.",
        [{ text: "OK", onPress: expect.any(Function) }],
      );
    });

    // Simulate pressing OK on the alert
    const alertOkButton = Alert.alert.mock.calls[0][2][0].onPress;
    act(() => {
      alertOkButton();
    });
    expect(mockNavigate).toHaveBeenCalledWith("Login");
  });

  it("displays loading indicator when auth is loading", () => {
    mockAuthContextValue.loading = true;
    const { getByText } = render(
      <RegisterScreen navigation={mockNavigation} />,
      {
        wrapper: AllTheProviders,
      },
    );
    const registerButton = getByText("Register").parent.parent; // Access the Button component
    expect(registerButton.props.loading).toBe(true);
    expect(registerButton.props.disabled).toBe(true);
  });

  it("displays error message from AuthContext or server if registration fails", async () => {
    const authErrorMessage = "Email already exists.";
    mockAuthContextValue.error = authErrorMessage;
    const { getByText, getByLabelText } = render(
      <RegisterScreen navigation={mockNavigation} />,
      { wrapper: AllTheProviders },
    );
    expect(getByText(authErrorMessage)).toBeTruthy();
    mockAuthContextValue.error = null; // Reset for next part of test

    // Test server-side error during submission
    const serverErrorMessage = "Registration failed. Please try again.";
    mockRegister.mockRejectedValueOnce(new Error(serverErrorMessage));
    fireEvent.changeText(getByLabelText("Full Name"), "Fail User");
    fireEvent.changeText(getByLabelText("Email"), "fail@example.com");
    fireEvent.changeText(getByLabelText("Password"), "FailPass123");
    fireEvent.changeText(getByLabelText("Confirm Password"), "FailPass123");
    fireEvent.press(getByText("Register"));

    await waitFor(() => {
      expect(getByText(serverErrorMessage)).toBeTruthy();
    });
  });

  it('navigates to Login screen when "Login" button is pressed', () => {
    const { getByText } = render(
      <RegisterScreen navigation={mockNavigation} />,
      {
        wrapper: AllTheProviders,
      },
    );

    const loginButton = getByText("Already have an account? Login");
    fireEvent.press(loginButton);

    expect(mockNavigate).toHaveBeenCalledWith("Login");
  });
});
